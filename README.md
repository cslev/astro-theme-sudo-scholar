<h1 align="center">Sudo Scholar</h1>

<p align="center">
	An Astro template for academic/professional personal sites — CV,
	blog, publications, projects, and news. Fully static output, deployable
	to any static host.
</p>

<p align="center">
	<a href="https://cslev.github.io/astro-theme-sudo-scholar/"><strong>Live Demo →</strong></a>
</p>

## Features

- **CV page** — work history, education, skills, teaching, certificates, as a clean print-friendly timeline; public by default, with an optional PHP password gate for PHP-capable hosting (see below)
- **Publications** — BibTeX-driven, with a filterable topical keyword cloud and color-coded type badges (conference, journal, magazine, talk, preprint, pending)
- **Datasets** — a listing + detail-page collection for releasing data alongside your research, each with its own "Access Dataset" link
- **Blog** — tags, an archive view, table of contents, author bylines, and built-in site search (Pagefind)
- **News** — a lightweight announcements feed, independent of the blog
- **Dark mode**, a terminal-styled `$ whoami` hero, and auto-generated social-preview (OG) images per page
- Zero server runtime required — everything ships as static HTML/CSS/JS

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
- `src/styles/global.css` — theme colors and typography

The one placeholder blog post and one placeholder news item are there to
demonstrate the schema — delete them once you've added your own.

## News Workflow

The News collection has no pagination and no automatic cutoff — every
entry in `src/content/news/` that isn't `archived: true` shows up, oldest
last. To retire an old entry, set `archived: true` in its frontmatter
rather than deleting the file, so the record isn't lost.

## Layout & Components

- `src/pages/cv.astro` — the CV page, public by default (see "CV Password Gate" below if you want to lock it down)
- `src/layouts/BlogPost.astro` — blog post layout
- `src/components/Header.astro` / `Footer.astro` — nav and footer

## CV Password Gate (optional, off by default)

`/cv` is fully public out of the box, so the template works identically on
every host — including static-only ones like GitHub Pages, Netlify, and
Vercel, which can't run the gate described below at all. Turn this on only
if you're deploying to **PHP-capable hosting** (Apache/LiteSpeed + PHP —
most shared/cPanel hosting) and actually want the CV behind a password.

The mechanism: a small PHP proxy sits in front of the built CV page, which
is itself moved somewhere a direct HTTP request can't reach — only the PHP
script can read it off disk. Setting it up is six steps:

1. **Rename the CV page** so it no longer builds to the public `/cv/` URL:
   ```bash
   git mv src/pages/cv.astro src/pages/cv-content.astro
   ```
2. **Hide it from the search index** — open `src/pages/cv-content.astro`
   and add `data-pagefind-ignore` to its `<body>` tag:
   ```diff
   -<body>
   +<body data-pagefind-ignore>
   ```
   Without this, Pagefind (which walks every built HTML file, unaffected by
   `.htaccess`) would index and publicly expose the full CV text through
   the site's own search box — defeating the gate entirely.
3. **Block direct access** to the built CV file — create
   `public/cv-content/.htaccess`:
   ```apache
   # Apache 2.4+
   <IfModule mod_authz_core.c>
       Require all denied
   </IfModule>

   # Apache 2.2 fallback
   <IfModule !mod_authz_core.c>
       Order deny,allow
       Deny from all
   </IfModule>
   ```
4. **Add the gate script** — create `public/cv/.htaccess`:
   ```apache
   DirectoryIndex index.php index.html
   ```
   and `public/cv/index.php`:
   ```php
   <?php
   const CV_PASSWORD_HASH = '$2b$10$rCObfmKAzFDU5DSdeoBLcumQvN58U0zxziJqw9cc.qGkrWI0vJkNO'; // "changeme" — replace this, see step 6
   const CONTENT_FILE = __DIR__ . '/../cv-content/index.html';
   const GATE_URL = '/cv/';

   $isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
   session_set_cookie_params([
       'lifetime' => 0,
       'path' => '/',
       'secure' => $isHttps,
       'httponly' => true,
       'samesite' => 'Lax',
   ]);
   session_start();

   $error = '';

   if ($_SERVER['REQUEST_METHOD'] === 'POST') {
       $password = $_POST['password'] ?? '';
       if (password_verify($password, CV_PASSWORD_HASH)) {
           session_regenerate_id(true);
           $_SESSION['cv_ok'] = true;
           header('Location: ' . GATE_URL);
           exit;
       }
       sleep(1); // trivial brute-force deterrent, not a substitute for a strong password
       $error = 'Incorrect password.';
   }

   if (!empty($_SESSION['cv_ok'])) {
       if (!is_readable(CONTENT_FILE)) {
           http_response_code(500);
           echo 'CV content is unavailable right now.';
           exit;
       }
       header('Content-Type: text/html; charset=utf-8');
       header('Cache-Control: no-store, private');
       readfile(CONTENT_FILE);
       exit;
   }
   ?>
   <!doctype html>
   <html lang="en">
   <head>
   <meta charset="utf-8" />
   <meta name="viewport" content="width=device-width,initial-scale=1" />
   <meta name="robots" content="noindex, nofollow" />
   <title>CV</title>
   </head>
   <body>
     <h1>This CV is password-protected</h1>
     <?php if ($error !== ''): ?><p><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
     <form method="post" action="<?= htmlspecialchars(GATE_URL, ENT_QUOTES, 'UTF-8') ?>">
       <input type="password" name="password" placeholder="Password" autofocus required />
       <button type="submit">View CV</button>
     </form>
   </body>
   </html>
   ```
   (Style the form however you like — this is deliberately bare-bones.)
5. **Restore the nav active-state fix** — the CV page now builds to
   `/cv-content/` again while every link still points at `/cv/` (the PHP
   proxy), so the nav highlighting needs to know these are the same page.
   In `src/components/HeaderLink.astro`, add this remap right before
   `const hrefValue = ...`:
   ```diff
   +// The CV page builds to /cv-content/, but every visitor-facing link
   +// (and the browser's address bar) says "/cv" — the PHP gate in front of
   +// it rewrites the URL. Without this remap, the nav item for "/cv" would
   +// never match the page's real build-time pathname.
   +const rawPathname = normalizePath(Astro.url.pathname);
   +const pathname = rawPathname === '/cv-content' ? '/cv' : rawPathname;
   -const pathname = normalizePath(Astro.url.pathname);
   ```
6. **Set a real password.** The hash above is for the placeholder password
   `changeme` — generate your own before deploying anywhere real:
   ```bash
   php -r "echo password_hash('yournewpassword', PASSWORD_BCRYPT), PHP_EOL;"
   ```
   and replace `CV_PASSWORD_HASH` in `public/cv/index.php` with the output.
   Never commit the plaintext password itself, only the hash.

Locally, `/cv` will 404 during `npm run dev` once you've done this — that's
expected, since the dev server doesn't execute PHP. The gate only actually
works once deployed to PHP-capable hosting; on any static-only host it
would 404 the same way in production, so don't enable this unless you know
your host runs PHP.

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
	pages/           Route files (cv, publications, projects, news, tags, 403/404, ...)
	styles/          Global styles
	utils/           BibTeX parsing, OG image generation, path helpers
public/
	projects/        Project logo images
```

(`public/cv/` and `public/cv-content/` only exist if you've set up the
optional password gate — see "CV Password Gate" above.)

## Docs

- `CLAUDE.md` — if you use Claude Code (or a similar AI coding assistant) on this project, this documents the git workflow and verification conventions the project expects.
- `CHANGELOG.md` — notable changes to the template itself over time.
- `docs/blog-post-authoring.md` — the blog post frontmatter schema, the shared hero-image mechanism, and two Markdown gotchas (YAML frontmatter apostrophes, literal `$` signs) that have silently corrupted real posts before — worth reading before you write your first one.

## Security

- Security policy: [.github/SECURITY.md](.github/SECURITY.md)

## License

Built on top of the MIT-licensed [Astro Scholar](https://github.com/shravanngoswamii/astro-scholar) template. Licensed under the MIT [LICENSE](LICENSE) — the original template's copyright notice is preserved there as required by its license; this template's own changes are likewise free to reuse under the same terms.
