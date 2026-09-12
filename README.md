<h1 align="center">Sudo Scholar</h1>

<p align="center">
	An Astro template for academic/professional personal sites — CV,
	blog, publications, projects, and news. Fully static output, deployable
	to any static host.
</p>

## Getting Started

```bash
npm install
npm run dev
```

Opens at `http://localhost:4321` by default.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Build production site (`dist/`), including the Pagefind search index |
| `npm run preview` | Preview the production build locally |
| `npm run astro -- <command>` | Run Astro CLI commands |
| `npm run import:medium` | Import a post from a Medium article URL (`scripts/import-medium-post.mjs`) |

## Making It Yours

Everything below is marked `TODO:` in the actual files — search the repo
for `TODO` to find every spot that needs your own content.

- `src/consts.ts` — site title, footer tagline, contact email, social links
- `src/data/cv.ts` — CV content (summary, work history, education, skills, certificates, teaching, fun facts)
- `src/data/authors.json` — your author profile (referenced by blog posts and publications)
- `src/data/projects.json` — project entries (YouTube embeds or logo+link cards)
- `src/data/publications.bib` — publications, as BibTeX (supports an extra `keywords = {...}` field used by the keyword-cloud filter on the Publications page)
- `src/components/LogoMarquee.astro` — the "Institutes Worked With" logo strip on the homepage; replace the four placeholder logos and names with your own (or remove the `<LogoMarquee />` line from `src/pages/index.astro` if you don't want this section at all)
- `src/pages/index.astro` — the "About me" section's four cards (Education/Engineering/Research/Blogging) and the hero bio text/rotating role labels
- `src/content/blog/*.md` — blog posts (see `docs/blog-post-authoring.md` for the frontmatter schema and two Markdown gotchas worth knowing about)
- `src/content/news/*.md` — news items (see "News workflow" below)
- `astro.config.mjs` — set `site:` to your actual deployed domain (required for a correct sitemap/RSS/OG URLs)
- `public/cv/index.php` — see "CV Password Gate" below
- `src/styles/global.css` — theme colors and typography

The one placeholder blog post and one placeholder news item are there to
demonstrate the schema — delete them once you've added your own.

## News Workflow

The News collection has no pagination and no automatic cutoff — every
entry in `src/content/news/` that isn't `archived: true` shows up, oldest
last. To retire an old entry, set `archived: true` in its frontmatter
rather than deleting the file, so the record isn't lost.

## Layout & Components

- `src/pages/cv-content.astro` — the actual CV page content. **Never rename this file** — the CV password gate (below) depends on this exact build path.
- `src/layouts/BlogPost.astro` — blog post layout
- `src/components/Header.astro` / `Footer.astro` — nav and footer

## CV Password Gate (optional)

`/cv` can be put behind a password prompt via a small PHP proxy
(`public/cv/index.php`) in front of the built `cv-content.astro` page.
**This only works on PHP-capable hosting** (Apache/LiteSpeed + PHP — most
shared/cPanel hosting). On a static-only host (Netlify, Vercel, GitHub
Pages, ...) this file never executes, so `/cv` is simply public — that's
an acceptable fallback, not a broken state, but worth knowing before you
rely on it for anything sensitive.

The shipped default password is **`changeme`** — a working demo credential,
not a real secret. Before deploying anywhere real:

1. Generate a bcrypt hash for your own password:
   ```bash
   php -r "echo password_hash('yournewpassword', PASSWORD_BCRYPT), PHP_EOL;"
   ```
2. Replace `CV_PASSWORD_HASH` in `public/cv/index.php` with the output.
3. Never commit the plaintext password itself, only the hash.

Locally, `/cv` 404s during `npm run dev` — that's expected, since the dev
server doesn't execute PHP. The gate only actually works once deployed to
PHP-capable hosting.

If you don't want this feature at all, delete `public/cv/index.php`,
`public/cv/.htaccess`, and `public/cv-content/.htaccess`, and point the
`/cv` nav link at `/cv-content` directly instead.

## Build & Deploy

`npm run build` produces a fully static `dist/` (Astro build + a Pagefind
search index, chained via the `postbuild` script) — no server-side
rendering, no Node runtime needed in production (aside from the optional
PHP CV gate above). Deploy the contents of `dist/` to any static host —
Netlify, Vercel, GitHub Pages, or plain rsync-to-a-server all work
identically, since nothing here depends on a specific host.

## Project Structure

```text
src/
	components/      Reusable UI components (Header, Footer, Timeline, KeywordCloud, ...)
	content/blog/    Markdown blog posts
	content/news/    Markdown news items
	data/            CV, authors, projects, publications (BibTeX)
	layouts/         Page layouts (blog post)
	pages/           Route files (cv-content, publications, projects, news, tags, 403/404, ...)
	styles/          Global styles
	utils/           BibTeX parsing, OG image generation, path helpers
public/
	cv/              Optional CV password-gate proxy (PHP)
	cv-content/      Built CV HTML, blocked from direct access
	projects/        Project logo images
```

## Docs

- `CLAUDE.md` — if you use Claude Code (or a similar AI coding assistant) on this project, this documents the git workflow and verification conventions the project expects.
- `CHANGELOG.md` — notable changes to the template itself over time.
- `docs/blog-post-authoring.md` — the blog post frontmatter schema, the shared hero-image mechanism, and two Markdown gotchas (YAML frontmatter apostrophes, literal `$` signs) that have silently corrupted real posts before — worth reading before you write your first one.

## Security

- Security policy: [.github/SECURITY.md](.github/SECURITY.md)

## License

Built on top of the MIT-licensed [Astro Scholar](https://github.com/shravanngoswamii/astro-scholar) template. Licensed under the MIT [LICENSE](LICENSE) — the original template's copyright notice is preserved there as required by its license; this template's own changes are likewise free to reuse under the same terms.
