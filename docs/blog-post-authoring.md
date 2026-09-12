# Authoring a new blog post

## The hero design is automatic — don't rebuild it per post

Every blog post is rendered through the single shared layout,
`src/layouts/BlogPost.astro`, via `src/pages/blog/[...slug].astro`. The hero
(background image + dark overlay + date/title text overlaid in white, the
Table of Contents side pane, the tags row) lives entirely in that one
layout's `<style>` block — **not** in any individual post's Markdown file.

This means: every current and future post gets the exact same hero design
automatically, just by going through the normal collection pipeline
(`src/content/blog/*.md` → `[...slug].astro` → `BlogPost.astro`). You never
need to (and should not) add per-post CSS, wrapper markup, or styling
overrides to reproduce it — if a post looks different, something is wrong
with its frontmatter, not something that needs new styling.

If the hero design itself ever needs to change (different overlay opacity,
different title sizing, etc.), change it **once** in `BlogPost.astro` — it
will apply to every post, past and future, immediately.

### What a post needs, to get the standard hero

From `src/content.config.ts`'s `blog` collection schema:

| Field | Required? | Effect on the hero |
|---|---|---|
| `title` | yes | The overlaid `<h1>`, sized responsively via `clamp()` so it never overflows the hero image regardless of screen width or title length. |
| `pubDate` | yes | The date line above the title. |
| `heroImage` | no | The background photo. **If omitted**, the hero falls back to this post's auto-generated social-preview card (`/blog/<slug>.png`, built by `src/utils/generateOgImage.ts`) — same overlay/title treatment either way, just a different background. |
| `subtitle` | no | The small pill label on that same auto-generated social-preview image (e.g. `"Part I"`) — falls back to `"Blog Post"` if unset. Cosmetic only, doesn't affect the on-page hero. |
| `description`, `authors`, `tags`, `toc` | — | Standard collection fields, unrelated to the hero itself but required/used elsewhere on the page. |

If you add a `heroImage`, use a real photo/screenshot relevant to the post —
place it under `src/assets/blog/<slug>/` and reference it with a relative
path so Astro's image pipeline optimizes it at build time. Don't hotlink
external images.

## Two Markdown gotchas that silently corrupt a post

**Apostrophes in single-quoted frontmatter strings.** If a `description`,
`title`, or other single-quoted YAML frontmatter field needs an apostrophe
(e.g. "Let's Encrypt"), escape it as a **doubled single quote** (`''`):

```yaml
description: 'Automating wildcard Let''s Encrypt renewals...'
```

Not `'Automating wildcard Let'"'"'s Encrypt renewals...'` — that
`'"'"'` sequence is shell quoting syntax, not YAML. It's easy to type by
muscle memory if the string was assembled like a shell command, and it
produces a literal `'"'"'` in the rendered page instead of an apostrophe.

**A literal `$` in prose can silently eat everything up to the next `$`.**
This site's Markdown pipeline has `remark-math`/`rehype-katex` wired in
(for LaTeX support), which treats `$...$` as inline math. A bare dollar
sign that's just plain text — a price ("$5–$7/month"), a shell variable
mentioned in prose ("`$num_threads`") — pairs up with the *next* unrelated
`$` later in the same paragraph and gets rendered as a broken math widget,
silently swallowing every word (and any markdown links) in between. This
isn't a hypothetical: exactly this has happened in real posts on this site
before being caught — a whole sentence plus a link vanished into a garbled
equation over a plain pricing mention.

**Escape every literal `$` in prose as `\$`.** This has no effect on
actual math (which still uses plain `$...$`/`$$...$$`), and it's the only
reliable fix — inside a fenced code block or inline code span you don't
need to bother, `remark-math` never parses inside those. When in doubt
after writing a paragraph with a `$` in it, build (`npm run build`) and
check the rendered post for extra/garbled text rather than assuming it's
fine.

## Importing a post from Medium

`scripts/import-medium-post.mjs` automates converting a Medium article into
a post in this collection. Run it with just the article URL:

```bash
npm run import:medium -- "https://medium.com/your-publication/your-post-slug-abc123"
```

What it does automatically:

1. **Fetches the article.** Tries the live URL first. Medium frequently
   blocks direct/automated requests (Cloudflare bot-check) and/or truncates
   "Member-only story" posts to a free preview for anonymous readers. The
   script detects both conditions and falls back to the **Wayback Machine**,
   trying snapshots (oldest first — usually from before any paywall gating
   was applied) until it finds one with a real article body rather than
   just the preview stub. It never tries to bypass Medium's paywall
   directly — it only ever uses what Medium itself already exposed to
   anonymous crawlers at some point.
2. **Converts the body to Markdown** — headings, paragraphs, code blocks
   (with real line breaks/indentation preserved), blockquotes, lists,
   inline links/bold/italic — walking the article in document order.
3. **Fences command-sequence code blocks as `console` instead of `sh`.**
   These tutorials write shell commands with a leading `# ` to mean "run
   this as root" — a documentation convention, not a real comment. A plain
   `sh`/`bash` Shiki grammar reads a line-leading `#` as an actual comment
   and greys the whole line out (losing all highlighting for that line);
   stripping the `#` instead loses the visual distinction between a typed
   command and the terminal's own output. The fix, and the one this
   pipeline applies automatically: fence the block as `console` (Shiki's
   `shellsession` grammar) instead, which understands a leading `#`/`$` as
   a prompt marker rather than a comment — the command line and any output
   lines stay visually distinct. Trade-off, accepted deliberately: the
   command line itself renders in one flat color rather than getting
   per-word syntax highlighting.

   This is mandatory, not a judgment call: every code block whose *first*
   line starts with `#` or `$ ` gets fenced as `console`, prompt and all.
   A block whose first line starts with neither is treated as file
   *content* being written out instead (a config file, YAML, JSON, a
   script) — it has no shell prompt at all, so it gets fenced as whichever
   real grammar matches what's being shown (`yaml` for a docker-compose.yml,
   `toml` for a `key = value` config file, `json` for a `{...}` file),
   falling back to a plain `sh` fence only when nothing more specific
   matches. Any `#` inside that kind of block is a genuine comment
   belonging to the file's own syntax (e.g. commented-out lines in a
   `docker-compose.yml`, or real Python comments in a geni-lib script) and
   is left untouched. See `isPromptBlock`/`detectFileLanguage` in the
   script for the exact rules.
4. **Picks the full-resolution image out of each figure.** Medium ships a
   tiny blurred lazy-load placeholder *and* the real image per figure;
   naively grabbing the first `<img>` gets the placeholder — the script
   specifically avoids that.
5. **Downloads every image** into `src/assets/blog/<slug>/` and rewrites
   the Markdown to reference them by relative path — no hotlinking to
   Medium or archive.org.
6. **Writes `src/content/blog/<slug>.md`** with frontmatter matching this
   site's schema, `heroImage` set to the first image, and `authors` set to
   this site's author id.

What it deliberately does **not** try to guess, and leaves as `TODO`
placeholders instead:

- **`description`** — a good one-line summary takes editorial judgment.
- **`subtitle`** — optional flavor text (e.g. `"Part I"`), your call.
- **`tags`** — only filled in if Medium's own topic-tag links were found in
  the fetched page; otherwise left as a TODO array.
- **`pubDate`** — only filled in if a machine-readable date was found in the
  fetched markup; older Medium page layouts don't always have one. If you
  see the "could not detect a publish date" warning, set it by hand from
  the article itself.

**Always review the output before publishing** — check that the title and
`pubDate` are right, fill in the `TODO`s, and skim the body for anything
that looks like a truncated preview rather than the full article (the
script warns loudly if the best source it found only had a handful of
paragraphs — that's a sign it only ever got the "Member-only story" free
preview, not the full text, and you may need to get the article's content
another way, e.g. asking the author for a Medium "Share as a Friend Link").

The Wayback Machine's own API is occasionally slow or returns a transient
503/504 under load — the script retries automatically, but if it fails
outright, it's usually worth just running it again a minute later rather
than assuming something is broken.

The slug (and therefore the filename and asset folder) is derived directly
from the article's URL path, with Medium's trailing hex ID stripped. Rename
the file/folder afterward if you want something shorter — the script
doesn't try to guess a nicer one for you.
