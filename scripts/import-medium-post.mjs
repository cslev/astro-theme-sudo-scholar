#!/usr/bin/env node
/**
 * Import a Medium article into this site's blog content collection.
 *
 * Usage:
 *   node scripts/import-medium-post.mjs <medium-article-url>
 *   node scripts/import-medium-post.mjs <path-to-exported-post.html>
 *
 * The second form reads one post file from Medium's own official
 * "Download your information" export (Settings > Security and apps >
 * Download your information) — the correct way to get the full text of a
 * post that's still just a "Member-only story" preview everywhere else,
 * including on every Wayback Machine snapshot. It's a first-party export of
 * the author's own account, not a scrape, and needs no paywall bypass.
 *
 * What this automates (previously done by hand for the BlueField-2 post):
 *   1. Fetch the article. Medium often blocks direct/automated requests
 *      (Cloudflare bot-check) and/or truncates "Member-only story" posts to
 *      a free preview. This script detects both and falls back to the
 *      Wayback Machine, trying snapshots until it finds one with the full
 *      body (not just the preview) — the earliest snapshot after
 *      publication is usually from before any paywall gating was applied.
 *      (Skipped entirely when given a local export file instead of a URL.)
 *   2. Parse the article body (headings, paragraphs, code blocks,
 *      blockquotes, lists, images/captions, links) into Markdown, in
 *      document order, using the same tag-walk approach validated against
 *      a real Medium export.
 *   3. Fence a command-sequence code block as `console` instead of `sh`
 *      (see isPromptBlock below) — mandatory, not optional, whenever the
 *      block's first line starts with a shell-prompt `#` or `$ `. The `console`
 *      grammar (Shiki's `shellsession`) understands a leading `#`/`$` as
 *      a prompt marker, not a comment, so the prompt+command line and any
 *      output lines stay visually distinct without losing the whole
 *      block's highlighting the way a plain `sh` grammar would (it reads
 *      a line-leading `#` as a real comment and greys the entire line
 *      out). File-content blocks (no prompt at all) get fenced as
 *      whichever real grammar matches what's being shown instead — `json`
 *      for a `{...}` file, `yaml` for a `key:` file like docker-compose.yml,
 *      `toml` for a `key = value` config file (see detectFileLanguage
 *      below), falling back to `sh` only when none of those match. Their
 *      internal `#` lines are genuine comments and are left untouched.
 *   4. Pick the full-resolution image out of each <figure> — Medium ships
 *      a tiny blurred lazy-load placeholder *and* the real image per
 *      figure; naively taking the first <img> gets the placeholder.
 *   5. Download every image into src/assets/blog/<slug>/ and rewrite the
 *      Markdown to reference them by relative path, so Astro's image
 *      pipeline optimizes them at build time — no hotlinking to Medium or
 *      archive.org. The file extension is detected from the downloaded
 *      bytes' own signature (see detectImageExtension), not the URL's
 *      apparent extension — Medium's resizing proxy frequently serves
 *      WebP-encoded bytes from a URL that looks like it ends in `.png`.
 *   6. Write src/content/blog/<slug>.md with frontmatter matching this
 *      site's blog schema (src/content.config.ts), with the first image
 *      set as heroImage (see docs/blog-post-authoring.md for what the
 *      shared hero design then does automatically).
 *
 * This does not require, and must never require, bypassing Medium's own
 * paywall — the Wayback Machine only ever serves what Medium itself
 * already exposed to anonymous crawlers. If that's still just a preview
 * for a given article, this script says so instead of guessing.
 *
 * Deliberately not automated: description, tags, and subtitle are left as
 * TODO placeholders for a human to fill in — a good one-line description
 * and a sensible tag list take editorial judgment, not scraping.
 */

import * as cheerio from 'cheerio';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTHOR_ID = 'levente-csikor';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTENT_DIR = path.join(ROOT, 'src/content/blog');
const ASSETS_ROOT = path.join(ROOT, 'src/assets/blog');

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MIN_GOOD_PARAGRAPHS = 6; // below this, treat a snapshot as "just the preview"
const MAX_SNAPSHOTS_TO_TRY = 8; // don't hammer the Wayback API forever

/**
 * The Wayback Machine in particular is known to be occasionally slow or to
 * return a transient 503/504 under load — retry a couple of times before
 * giving up, rather than treating a blip as "this snapshot doesn't work".
 */
async function fetchText(url, extraHeaders = {}, retries = 2) {
	for (let attempt = 0; ; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': USER_AGENT, ...extraHeaders },
				redirect: 'follow',
				signal: AbortSignal.timeout(45_000),
			});
			if ((res.status === 503 || res.status === 504) && attempt < retries) {
				await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
				continue;
			}
			return { status: res.status, ok: res.ok, html: await res.text() };
		} catch (err) {
			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
				continue;
			}
			throw err;
		}
	}
}

function looksBlocked(status, html) {
	if (status === 403 || status === 429) return true;
	if (/<title>\s*Just a moment/i.test(html)) return true; // Cloudflare challenge
	if (/cf-browser-verification|cf_captcha/i.test(html)) return true;
	return false;
}

/** Strip the Wayback Machine's URL-rewriting prefix off a proxied asset/link URL. */
function stripArchivePrefix(url) {
	if (!url) return url;
	const m = url.match(/\/web\/\d+(?:im_)?\/(https?:\/\/.*)/);
	return m ? m[1] : url;
}

function countSubstantialParagraphs($, root) {
	let count = 0;
	root.find('p, li, blockquote').each((_, el) => {
		const text = $(el).text().trim();
		if (text.length >= 20) count++;
	});
	return count;
}

async function getWaybackSnapshots(articleUrl) {
	const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
		articleUrl,
	)}&output=json&filter=statuscode:200`;
	const { html: json } = await fetchText(cdxUrl);
	/** @type {any[]} */
	let rows;
	try {
		rows = JSON.parse(json);
	} catch {
		return [];
	}
	if (!Array.isArray(rows) || rows.length < 2) return [];
	const [header, ...data] = rows;
	const tsIdx = header.indexOf('timestamp');
	const origIdx = header.indexOf('original');
	const lenIdx = header.indexOf('length');
	return data
		.map((row) => ({
			timestamp: row[tsIdx],
			original: row[origIdx],
			length: Number(row[lenIdx] || 0),
		}))
		.sort((a, b) => a.timestamp.localeCompare(b.timestamp)); // oldest first
}

/**
 * Try the live URL, then Wayback snapshots (oldest first), until one has a
 * real article body rather than a paywall/member-only preview. Returns the
 * best candidate found even if none clear the "good" threshold, along with
 * a warning to surface to the user in that case.
 */
async function fetchArticle(articleUrl) {
	const warnings = [];
	const candidates = [];

	try {
		const direct = await fetchText(articleUrl);
		if (!looksBlocked(direct.status, direct.html)) {
			candidates.push({ html: direct.html, source: articleUrl });
		} else {
			warnings.push('Direct fetch was blocked (bot-check or rate limit) — falling back to Wayback Machine.');
		}
	} catch (err) {
		warnings.push(`Direct fetch failed (${err.message}) — falling back to Wayback Machine.`);
	}

	let snapshots = [];
	try {
		snapshots = await getWaybackSnapshots(articleUrl);
	} catch (err) {
		warnings.push(`Wayback Machine snapshot lookup failed (${err.message}).`);
	}
	if (snapshots.length === 0 && candidates.length === 0) {
		throw new Error(
			'No usable source found: the direct fetch failed/was blocked, and the Wayback Machine lookup ' +
				'also failed or found no snapshots. This may be a transient Wayback Machine outage — try again shortly.',
		);
	}

	let best = null;
	let bestScore = -1;
	for (const c of candidates) {
		const $ = cheerio.load(c.html);
		const root = $('article').first().length ? $('article').first() : $('body');
		const score = countSubstantialParagraphs($, root);
		if (score > bestScore) {
			best = { ...c, score };
			bestScore = score;
		}
	}

	if (bestScore < MIN_GOOD_PARAGRAPHS) {
		for (const snap of snapshots.slice(0, MAX_SNAPSHOTS_TO_TRY)) {
			const waybackUrl = `https://web.archive.org/web/${snap.timestamp}/${snap.original}`;
			try {
				const { html } = await fetchText(waybackUrl);
				const $ = cheerio.load(html);
				const root = $('article').first().length ? $('article').first() : $('body');
				const score = countSubstantialParagraphs($, root);
				if (score > bestScore) {
					best = { html, source: waybackUrl, score };
					bestScore = score;
				}
				if (bestScore >= MIN_GOOD_PARAGRAPHS) break;
			} catch (err) {
				warnings.push(`Wayback snapshot ${snap.timestamp} failed to fetch (${err.message}).`);
			}
		}
	}

	if (!best) {
		throw new Error('Could not fetch any usable version of this article (direct or Wayback).');
	}
	if (bestScore < MIN_GOOD_PARAGRAPHS) {
		warnings.push(
			`Best source found only has ${bestScore} substantial paragraph(s) — this may still be a ` +
				`"Member-only story" preview rather than the full article. Check the output before publishing, ` +
				`and consider asking the author for a Medium "Share as a Friend Link" to unlock the full text.`,
		);
	}

	return { html: best.html, source: best.source, warnings };
}

/**
 * Cheerio's plain `.text()` concatenates every descendant text node with no
 * separator at all, which runs an entire code block onto one unreadable
 * line. A real line break belongs exactly where the source has a literal
 * `<br>` — nowhere else. It's tempting to *also* insert one between any two
 * adjacent text nodes (to cover a Medium era that used bare sibling <span>s
 * per line with no <br> at all), but that breaks Medium's own official post
 * export: there, an inline `<code>` or `<a>` run (e.g. a URL inside a `wget`
 * command) sits mid-line as its own text node with no `<br>` around it, and
 * inserting a break there splits one working shell command across two
 * lines. Only <br> reliably means "new line" across both formats, so that's
 * the only thing this treats as one; anything else (a rare bare-<span>,
 * no-<br> code block from an old snapshot) needs a manual fix, same as any
 * other source-formatting quirk this script can't safely auto-detect.
 */
function textWithLineBreaks($, el) {
	const parts = [];
	(function walk(node) {
		$(node)
			.contents()
			.each((_, child) => {
				if (child.type === 'text') {
					if (child.data) parts.push(child.data);
				} else if (child.type === 'tag') {
					if (child.tagName === 'br') {
						parts.push('\n');
					} else {
						walk(child);
					}
				}
			});
	})(el);
	return parts.join('');
}

function inlineToMarkdown($, node) {
	let out = '';
	$(node)
		.contents()
		.each((_, child) => {
			if (child.type === 'text') {
				out += child.data;
				return;
			}
			if (child.type !== 'tag') return;
			const $child = $(child);
			switch (child.tagName) {
				case 'a': {
					let href = stripArchivePrefix($child.attr('href') || '');
					const redirectMatch = href.match(/redirectUrl=([^&]+)/);
					if (redirectMatch) href = decodeURIComponent(redirectMatch[1]);
					const text = inlineToMarkdown($, child);
					out += href && !href.startsWith('/') ? `[${text}](${href})` : text;
					break;
				}
				case 'strong':
				case 'b':
					out += `**${inlineToMarkdown($, child)}**`;
					break;
				case 'em':
				case 'i':
					out += `*${inlineToMarkdown($, child)}*`;
					break;
				case 'code':
					out += `\`${$child.text()}\``;
					break;
				case 'br':
					out += '\n';
					break;
				default:
					out += inlineToMarkdown($, child);
			}
		});
	return out;
}

/** Pick the full-resolution image from a Medium <figure>: the tiny blurred
 * lazy-load placeholder is usually the *first* <img>, the real one last. */
function largestFromSrcset(srcset) {
	// "url1 276w, url2 552w, url3 700w" -> url3 (assumes ascending order,
	// which is what Medium emits; if that's ever untrue this just falls
	// back to *a* real image rather than the tiny one, still a big win).
	const last = (srcset || '').split(',').pop()?.trim().split(/\s+/)[0];
	return last || null;
}

/**
 * Medium ships (at least) two different markup shapes across the years:
 *
 * - Newer pages: the visible <img>s are the tiny blurred lazy-load
 *   placeholder plus an empty (unpopulated-without-JS) target — the real
 *   full-resolution image only exists inside a <noscript> block, there
 *   specifically for exactly this "no JS execution" scraping scenario.
 *   HTML parsers treat <noscript> contents as an opaque text blob rather
 *   than queryable child elements, so it has to be re-parsed separately.
 * - Older pages: a <picture> with <source srcset> at multiple widths, or
 *   just plain sibling <img> tags with the full-res one appearing last.
 *
 * Try them in that order — <noscript> first, since when present it's the
 * most reliable source of the true full-resolution URL.
 */
function pickFigureImage($, figure) {
	const noscript = $(figure).find('noscript').first();
	if (noscript.length) {
		const inner = cheerio.load(noscript.html() || '');
		const img = inner('img').first();
		if (img.length) {
			const fromSrcset = largestFromSrcset(img.attr('srcset'));
			const src = fromSrcset || img.attr('src');
			if (src) return stripArchivePrefix(src);
		}
	}

	const picture = $(figure).find('picture').first();
	if (picture.length) {
		let best = null;
		picture.find('source[srcset]').each((_, s) => {
			const candidate = largestFromSrcset($(s).attr('srcset'));
			if (candidate) best = candidate;
		});
		if (best) return stripArchivePrefix(best);
	}

	const imgs = $(figure)
		.find('img')
		.filter((_, img) => Boolean($(img).attr('src')))
		.toArray();
	if (imgs.length === 0) return null;
	return stripArchivePrefix($(imgs[imgs.length - 1]).attr('src'));
}

/**
 * Medium tutorials in this series write shell commands with a leading `# `
 * to indicate a root prompt (a documentation convention, not a real
 * comment). A plain `sh`/`bash` Shiki grammar reads a line-leading `#` as
 * an actual comment and greys the whole line out, destroying the command's
 * syntax highlighting — but stripping the `#` entirely (an earlier version
 * of this pipeline did that) makes multi-command blocks with real output
 * interleaved hard to read, since there's no visual marker distinguishing
 * "this is what I typed" from "this is what the terminal printed back".
 *
 * The fix: fence these blocks as `console` instead of `sh`/`bash`. Shiki
 * bundles a dedicated `shellsession` grammar (alias `console`, verified
 * against the installed Shiki package) that treats a leading `#`/`$` as a
 * prompt marker, not a comment — the prompt+command line renders in one
 * consistent style and output lines render in another, so the two stay
 * visually distinct. The trade-off: the command line itself doesn't get
 * per-word syntax highlighting (no distinct color for the command name,
 * flags, etc.) — verified empirically, and accepted as the right trade
 * for readability over per-token color.
 *
 * Only applies when the *first* line of the block already starts with
 * `#` or `$ `: that's the signal this whole block is a sequence of
 * prompt-invoked commands (root `#`, non-root `$`). A block whose first
 * line does NOT start with either is file *content* being written out
 * (a config file, JSON, YAML, a script being authored) — it has no shell
 * prompt at all, so it gets fenced as whatever grammar actually matches
 * (see detectFileLanguage) with full syntax highlighting; any `#` inside
 * it is a genuine comment belonging to that file's own syntax (e.g. a
 * docker-compose.yml with real commented-out
 * lines, or the geni-lib Python script in the BlueField-2 Part III post)
 * and must be left alone.
 */
function isPromptBlock(code) {
	const firstLine = code.split('\n')[0] ?? '';
	// A shebang ("#!/bin/bash") is always the first line of a *script file*
	// being written out, never something typed at a prompt — nobody types
	// "#!/bin/bash" as a command.
	if (firstLine.startsWith('#!')) return false;
	// This author's own root-prompt convention (checked throughout the
	// site) is always a single "# " — a doubled "##"/"###..." is a real
	// Markdown/YAML/file comment (e.g. "## explains the config below"),
	// not a prompt, even though it also starts with "#".
	if (/^##/.test(firstLine)) return false;
	if (!(firstLine.startsWith('#') || firstLine.startsWith('$ '))) return false;
	// A decorative comment banner (e.g. "###############" or "# --- FOO ---"
	// made only of punctuation) starts with `#` too, but it's the first line
	// of a *file* being shown (an nginx.conf section header, say), not a
	// shell prompt — a real prompt line always has a real command after it.
	if (!/[A-Za-z]/.test(firstLine)) return false;
	// A single "# labeling comment" followed only by a YAML list (every
	// other line starting with "- ") is a labeled config fragment being
	// pasted into a file — e.g. "#keycloak based auth" above a block of
	// `- KEY=value` docker-compose environment entries — not a shell
	// command. Deliberately narrow (just the `- ` list marker, not a bare
	// "key: value" line too): real command output regularly looks like
	// "KEY: value" (a `grep UUID` result, say), and that must still count
	// as a prompt block's output, not file content.
	const restLines = code
		.split('\n')
		.slice(1)
		.map((l) => l.trim())
		.filter(Boolean);
	if (restLines.length > 0 && restLines.every((l) => /^-\s/.test(l))) {
		return false;
	}
	// Two or more bare (no #/$ prompt) tight `key=value` lines — the shape
	// of a .conf/.env file's own settings, e.g. ddclient.conf's `daemon=300`
	// — are a config file being pasted in, not command output: real
	// terminal output showing that shape is rare enough next to how often
	// this site pastes in a labeled config file (a "# <what this file is>"
	// comment first, then its bare settings) to make this the safer read.
	const bareAssignments = restLines.filter(
		(l) => !l.startsWith('#') && !l.startsWith('$ ') && /^[A-Za-z_][\w.-]*=\S/.test(l),
	);
	if (bareAssignments.length >= 2) return false;
	return true;
}

/**
 * For a block that isn't a shell-prompt sequence (see isPromptBlock), guess
 * which real file format it's showing so it gets that grammar's own syntax
 * highlighting instead of a generic `sh` fence — a docker-compose.yml as
 * `yaml`, a config file with `key = value` lines as `toml`, a JSON file as
 * `json`, an nginx server block as `nginx`, a Python snippet as `python`.
 * Falls back to `sh` for anything else (single-line file edits like an
 * fstab/crypttab entry or a cmdline.txt append, systemd unit snippets,
 * etc.) where no specific grammar is clearly right.
 */
function detectFileLanguage(code) {
	const trimmed = code.trim();
	// A bracketed line on its own (`[Unit]`) is an INI/systemd/TOML section
	// header, not a JSON array — only a brace means JSON here.
	if (trimmed.startsWith('{')) return 'json';
	const firstContentLine = trimmed
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (firstContentLine) {
		if (/^(import|from)\s+\w+/.test(firstContentLine)) return 'python';
		// Dockerfile instructions are conventionally all-caps ("FROM", never
		// "from" — that's Python's own import syntax, already checked above).
		if (/^FROM\s+\S+/.test(firstContentLine)) return 'dockerfile';
		if (/^(http|server|events|stream|upstream|location\s+\S+)\s*\{$/.test(firstContentLine)) return 'nginx';
		if (/^[A-Za-z_][\w.-]*\s+=\s+\S/.test(firstContentLine)) return 'toml';
		if (/^[A-Za-z_][\w.-]*:(\s|$)/.test(firstContentLine)) return 'yaml';
		if (/^-\s+\S/.test(firstContentLine)) return 'yaml';
		// A bare `[section]` header (an INI/TOML section, not JSON — see
		// above) doesn't say which on its own, since a systemd unit file
		// uses the same header syntax. Only call it TOML if some other
		// line in the block actually has a TOML-shaped `key = value` pair.
		if (/^\[[\w.-]+\]$/.test(firstContentLine)) {
			const hasTomlAssignment = trimmed
				.split('\n')
				.map((l) => l.trim())
				.some((l) => /^[A-Za-z_][\w.-]*\s+=\s+\S/.test(l));
			if (hasTomlAssignment) return 'toml';
		}
	} else {
		// Every line is a comment — e.g. a whole docker-compose environment
		// entry commented out for removal. Strip the leading "# " and test
		// the first line's own shape, since it's still that file's syntax.
		const firstLine = trimmed.split('\n')[0]?.replace(/^#+\s*/, '') ?? '';
		if (/^[A-Za-z_][\w.-]*\s+=\s+\S/.test(firstLine)) return 'toml';
		if (/^[A-Za-z_][\w.-]*:(\s|$)/.test(firstLine)) return 'yaml';
	}
	return 'sh';
}

function extractArticle(html) {
	const $ = cheerio.load(html);
	const root = $('article').first().length ? $('article').first() : $('body');

	const firstHeading = root.find('h1').first();
	// Medium's own data export additionally repeats the full title (main
	// title + subtitle combined) as a body heading marked `graf--title` —
	// more complete than the bare <h1> alone (which the export splits from
	// the subtitle into a separate, hidden `section[data-field=subtitle]`).
	// Prefer it when present; it's skipped as a body heading further below.
	const exportTitleHeading = root.find('.graf--title').first();
	const title =
		(exportTitleHeading.length ? exportTitleHeading.text().trim() : '') ||
		firstHeading.text().trim() ||
		$('title').text().trim();

	// Keep the full timestamp, not just the date: FormattedDate only ever
	// displays year/month/day, but two posts published on the same calendar
	// day (common in this series, where several parts went out hours apart)
	// still need to sort in true chronological order on the blog index.
	let pubDate = null;
	const timeEl = root.find('time[datetime]').first();
	if (timeEl.length) {
		pubDate = timeEl.attr('datetime') || null;
	}
	if (!pubDate) {
		// JSON-LD's `datePublished` is the true original publish date. Medium's
		// `article:published_time` meta tag is NOT reliable for this — it gets
		// bumped forward on every edit, so it reflects the last-edited time
		// instead (confirmed by cross-checking against a known-correct date:
		// it was off by several days, while `datePublished` matched exactly).
		$('script[type="application/ld+json"]').each((_, el) => {
			if (pubDate) return;
			try {
				const data = JSON.parse($(el).contents().text());
				const candidates = Array.isArray(data) ? data : [data];
				for (const entry of candidates) {
					const raw = entry?.datePublished;
					if (raw) {
						const parsed = new Date(raw);
						if (!Number.isNaN(parsed.getTime())) {
							pubDate = parsed.toISOString();
							break;
						}
					}
				}
			} catch {
				// not valid JSON-LD — ignore
			}
		});
	}
	if (!pubDate) {
		const metaPublished = $('meta[property="article:published_time"]').attr('content');
		if (metaPublished) {
			const parsed = new Date(metaPublished);
			if (!Number.isNaN(parsed.getTime())) pubDate = parsed.toISOString();
		}
	}
	if (!pubDate) {
		const dateText = root.find('[data-testid="storyPublishDate"]').first().text().trim();
		const parsed = dateText && new Date(dateText);
		if (parsed && !Number.isNaN(parsed.getTime())) {
			pubDate = parsed.toISOString();
		}
	}

	const tags = [];
	root.find('a[href*="/tag/"]').each((_, a) => {
		const href = $(a).attr('href') || '';
		const m = href.match(/\/tag\/([^/?#]+)/);
		if (m) {
			const tag = decodeURIComponent(m[1]).replace(/-/g, ' ');
			if (!tags.includes(tag)) tags.push(tag);
		}
	});

	const lines = [];
	const images = [];
	let skippedTitle = false;
	const seenPre = new Set();

	root.find('h1, h2, h3, h4, p, pre, blockquote, ul, ol, figure').each((_, el) => {
		const $el = $(el);
		const tag = el.tagName;

		// Medium's own export appends a <footer> inside <article> with
		// "By <author> on <date>", a canonical link, and an "Exported from
		// Medium on <date>" line — export boilerplate, not article content.
		if ($el.parents('footer').length) return;

		if (tag === 'p' && $el.parents('blockquote, figure, li').length) return;

		if (tag === 'h1') {
			if (!skippedTitle) {
				skippedTitle = true;
				return;
			}
		}
		if ($el.hasClass('graf--title')) return; // the export's duplicated full-title heading — already used as `title` above
		if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
			const text = inlineToMarkdown($, el).trim();
			if (!text) return;
			const level = { h1: '##', h2: '###', h3: '###', h4: '####' }[tag];
			lines.push(`\n${level} ${text}\n`);
			return;
		}
		if (tag === 'p') {
			const text = inlineToMarkdown($, el).trim().replace(/[ \t]+/g, ' ');
			if (text) lines.push(text + '\n');
			return;
		}
		if (tag === 'pre') {
			if (seenPre.has(el)) return;
			seenPre.add(el);
			const code = textWithLineBreaks($, el)
				.replace(/^[ \t]+$/gm, '') // whitespace-only lines are markup artifacts, not real blank lines
				.replace(/^\n+|\n+$/g, '');
			const fenceLang = isPromptBlock(code) ? 'console' : detectFileLanguage(code);
			lines.push(`\`\`\`${fenceLang}\n${code}\n\`\`\`\n`);
			return;
		}
		if (tag === 'blockquote') {
			const innerP = $el.find('p').first();
			const text = (innerP.length ? inlineToMarkdown($, innerP[0]) : inlineToMarkdown($, el))
				.trim()
				.replace(/[ \t]+/g, ' ');
			if (text) {
				// A blockquote with no wrapping <p> (a plain run of text/inline
				// elements) can still contain a <br>-separated second paragraph,
				// which inlineToMarkdown renders as a bare "\n". Only prefixing
				// the whole blob with a single "> " would leave every line after
				// the first without one — still valid Markdown via lazy blockquote
				// continuation, but it collapses what was a paragraph break in the
				// original into one run-on paragraph. Quote every line, with a
				// blank quoted line between them so multiple paragraphs stay
				// distinct paragraphs inside the same blockquote box.
				const quoted = text
					.split('\n')
					.map((line) => line.trim())
					.filter(Boolean)
					.map((line) => `> ${line}`)
					.join('\n>\n');
				lines.push(`${quoted}\n`);
			}
			return;
		}
		if (tag === 'ul' || tag === 'ol') {
			if ($el.parents('ul, ol').length) return;
			$el.children('li').each((_, li) => {
				const text = inlineToMarkdown($, li).trim().replace(/[ \t]+/g, ' ');
				lines.push(`${tag === 'ul' ? '-' : '1.'} ${text}`);
			});
			lines.push('');
			return;
		}
		if (tag === 'figure') {
			// Medium embeds a video (e.g. YouTube) as a <figure class="graf--iframe">
			// wrapping a bare <iframe src="...">, with no <img> at all — handle this
			// before the image path below, which would otherwise silently drop it.
			const iframeSrc = $el.find('iframe').first().attr('src');
			if (iframeSrc) {
				const ytMatch = iframeSrc.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
				if (ytMatch) {
					lines.push(
						`\n<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`,
					);
				} else {
					lines.push(`\n<div class="video-embed"><iframe src="${iframeSrc}" frameborder="0" allowfullscreen></iframe></div>\n`);
				}
				return;
			}

			const src = pickFigureImage($, el);
			const cap = $el.find('figcaption').first().text().trim();
			const alt = $el.find('img').first().attr('alt') || cap;
			if (src && /miro\.medium\.com|cdn-images-\d+\.medium\.com/.test(src)) {
				const idx = images.length;
				images.push({ src, alt: alt || cap });
				lines.push(`![${alt || cap}]({{IMG${idx}}})`);
				lines.push(cap ? `*${cap}*\n` : '');
			}
			return;
		}
	});

	let body = lines.join('\n');
	// Trim stray whitespace strictly inside markdown link syntax, without
	// touching code fences (where e.g. "[ OK ]" or "foo[1]:" must survive
	// untouched).
	const segments = body.split(/(```(?:sh|console|yaml|toml|json|nginx|python|dockerfile)\n[\s\S]*?\n```)/);
	body = segments
		.map((seg, i) => {
			if (i % 2 === 1) return seg; // inside a code fence
			let s = seg.replace(/\[\s+([^[\]]*?)\s*\]\(/g, '[$1](');
			s = s.replace(/(?<=[a-zA-Z])\[(?=[^\]]*\]\()/g, ' [');
			s = s.replace(/—\[(?=[^\]]*\]\()/g, '— [');
			// Medium sometimes wraps an em-dash in hair spaces (U+200A)
			// instead of regular ones -- invisible in the rendered page
			// but needless clutter in the markdown source.
			s = s.replace(/\u200a\u2014\u200a/g, ' \u2014 ');
			s = s.replace(/\u200a/g, ' ');
			return s;
		})
		.join('');
	body = body.replace(/\n{3,}/g, '\n\n').trim() + '\n';

	return { title, pubDate, tags, body, images };
}

function slugFromUrl(url) {
	const path = new URL(url).pathname;
	const last = path.split('/').filter(Boolean).pop() || 'imported-post';
	// Medium appends a trailing hex id to the slug, e.g. "-bcb4e689c7e6".
	return last.replace(/-[0-9a-f]{8,}$/i, '');
}

/**
 * Medium's own "Download your information" export (Settings > Security and
 * apps > Download your information) writes each post as a standalone HTML
 * file, fully unlocked regardless of member-only paywall gating — the only
 * reliable way to get the true full text of a paywalled post. Point this
 * script at one of those files instead of a URL and it skips fetching
 * entirely. The export's markup differs from a live Medium page in a few
 * ways this function/the code below account for:
 *   - No <noscript> placeholder trick — images are plain <img src> already
 *     pointing at a real (if older, cdn-images-N.medium.com) CDN host.
 *   - The real publish date is in a <time class="dt-published" datetime>
 *     inside the <footer> (still inside <article>, so the existing
 *     `time[datetime]` lookup in extractArticle finds it unchanged).
 *   - No tag links — Medium's export doesn't carry the tag list, so tags
 *     always come back empty from a local file (same TODO fallback as any
 *     other article where tags couldn't be detected).
 *   - A `<a class="p-canonical">` link in the footer gives back the
 *     original medium.com URL, so the slug can still be derived exactly as
 *     it would be from the live URL.
 */
function slugFromExportFile(html, filePath) {
	const $ = cheerio.load(html);
	const canonical = $('a.p-canonical').attr('href') || $('link[rel="canonical"]').attr('href');
	if (canonical) {
		try {
			return slugFromUrl(canonical);
		} catch {
			// fall through to filename-based slug
		}
	}
	const base = path.basename(filePath, path.extname(filePath));
	// Export filenames look like "2021-05-07_Part-VII-B---Some-Title--afaffce7af4f".
	return base
		.replace(/^\d{4}-\d{2}-\d{2}_/, '')
		.replace(/-{1,3}[0-9a-f]{8,}$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function yamlSingleQuote(str) {
	return `'${String(str).replace(/'/g, "''")}'`;
}

/**
 * Medium's CDN routinely serves WebP-encoded bytes from a URL that *looks*
 * like it ends in `.png` (its own resizing proxy re-encodes on the fly,
 * ignoring the nominal extension in the path) — trusting the URL's apparent
 * extension silently saves a real WebP file with a `.png` name. Detect the
 * actual format from the file's own signature instead, so the extension on
 * disk always matches what the bytes really are.
 */
function detectImageExtension(buf) {
	if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
		return 'webp';
	}
	if (buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
	if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) {
		return 'gif';
	}
	return null;
}

async function downloadImages(images, destDir) {
	await mkdir(destDir, { recursive: true });
	const results = [];
	for (let i = 0; i < images.length; i++) {
		const { src, alt } = images[i];
		try {
			const res = await fetch(src, { headers: { 'User-Agent': USER_AGENT } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			let ext = detectImageExtension(buf);
			if (!ext) {
				// Signature sniffing failed (an unrecognized format) — fall
				// back to whatever the URL implies, same as before.
				ext = (src.split('.').pop() || 'png').split('?')[0];
				if (!/^[a-z0-9]{2,4}$/i.test(ext)) ext = 'png';
			}
			const filename = `img-${String(i).padStart(2, '0')}.${ext}`;
			await writeFile(path.join(destDir, filename), buf);
			results.push({ filename, alt, ok: true });
		} catch (err) {
			results.push({ filename: null, alt, ok: false, error: err.message, src });
		}
	}
	return results;
}

async function main() {
	const input = process.argv[2];
	if (!input) {
		console.error(
			'Usage: node scripts/import-medium-post.mjs <medium-article-url>\n' +
				'   or: node scripts/import-medium-post.mjs <path-to-exported-post.html>',
		);
		process.exit(1);
	}

	const isLocalFile = !/^https?:\/\//i.test(input) && existsSync(input);

	let html, source, warnings;
	if (isLocalFile) {
		console.log(`Reading exported post: ${input}`);
		html = await readFile(input, 'utf-8');
		source = input;
		warnings = [];
	} else {
		console.log(`Fetching article: ${input}`);
		({ html, source, warnings } = await fetchArticle(input));
		console.log(`Using source: ${source}`);
	}
	for (const w of warnings) console.warn(`WARNING: ${w}`);

	const { title, pubDate, tags, body, images } = extractArticle(html);
	if (!title) throw new Error('Could not find a title in the fetched article.');

	// A literal "TODO" string here would fail the blog schema's
	// z.coerce.date() validation and break the build. If no real date was
	// found in the article markup, fall back to the Wayback Machine
	// snapshot's own capture date as a clearly-flagged *estimate* — a
	// defensible proxy (the article existed by then) rather than an
	// invented fact, and it keeps the file buildable in the meantime. This
	// fallback doesn't apply to a local export file (there's no Wayback
	// snapshot URL to read a date out of), so it just stays unset there —
	// exports always have the real date in the footer's <time> anyway.
	let pubDateFinal = pubDate;
	let pubDateIsEstimate = false;
	if (!pubDateFinal && !isLocalFile) {
		const waybackMatch = source.match(/\/web\/(\d{4})(\d{2})(\d{2})\d{6}\//);
		if (waybackMatch) {
			pubDateFinal = `${waybackMatch[1]}-${waybackMatch[2]}-${waybackMatch[3]}`;
			pubDateIsEstimate = true;
		}
	}

	const slug = isLocalFile ? slugFromExportFile(html, input) : slugFromUrl(input);
	const assetDir = path.join(ASSETS_ROOT, slug);
	const assetRelDir = `../../assets/blog/${slug}`;

	console.log(`Title: ${title}`);
	console.log(`Slug: ${slug}`);
	console.log(`Downloading ${images.length} image(s)...`);
	const downloaded = images.length ? await downloadImages(images, assetDir) : [];
	for (const d of downloaded) {
		if (!d.ok) console.warn(`WARNING: failed to download ${d.src} (${d.error})`);
	}

	let finalBody = body;
	downloaded.forEach((d, i) => {
		const placeholder = `{{IMG${i}}}`;
		finalBody = finalBody.replace(placeholder, d.ok ? `${assetRelDir}/${d.filename}` : d.src);
	});

	const heroImage = downloaded.find((d) => d.ok);

	const frontmatterLines = [
		'---',
		`title: ${yamlSingleQuote(title)}`,
		`description: 'TODO: replace with a real one-line description.'`,
		`subtitle: 'TODO: optional short label (e.g. "Part I")'`,
		...(pubDateIsEstimate
			? [`# ESTIMATED from the Wayback Machine capture date — verify and correct if you know the real date.`]
			: []),
		`pubDate: ${pubDateFinal ? yamlSingleQuote(pubDateFinal) : "'2000-01-01' # TODO: replace with the real publish date — placeholder only, no date could be detected or estimated"}`,
		...(heroImage ? [`heroImage: ${yamlSingleQuote(`${assetRelDir}/${heroImage.filename}`)}`] : []),
		'authors:',
		`  - ${AUTHOR_ID}`,
		'toc: true',
		'tags:',
		...(tags.length > 0 ? tags.map((t) => `  - ${yamlSingleQuote(t)}`) : ["  - 'TODO: replace with real tags'"]),
		'---',
		'',
	];

	const outPath = path.join(CONTENT_DIR, `${slug}.md`);
	await writeFile(outPath, frontmatterLines.join('\n') + '\n' + finalBody);

	console.log('');
	console.log(`Wrote ${path.relative(ROOT, outPath)}`);
	console.log(`Downloaded ${downloaded.filter((d) => d.ok).length}/${images.length} image(s) to ${path.relative(ROOT, assetDir)}/`);
	if (pubDateIsEstimate) {
		console.warn(`WARNING: no publish date found — used the Wayback Machine capture date (${pubDateFinal}) as an estimate. Verify it.`);
	} else if (!pubDateFinal) {
		console.warn('WARNING: could not detect or estimate a publish date — a 2000-01-01 placeholder was written. Fix it by hand before publishing.');
	}
	if (tags.length === 0) console.warn('WARNING: could not detect any tags — fill in tags by hand.');
	console.warn('NOTE: description, subtitle, and tags are starting points only — review before publishing.');
}

main().catch((err) => {
	console.error(`\nFailed: ${err.message}`);
	process.exit(1);
});
