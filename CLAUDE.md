# Instructions for AI assistants working in this repo

## Git workflow

- **Never commit proactively.** Finish and verify the work, leave it
  staged/unstaged, and only run `git commit` when explicitly asked for
  that specific commit at that point in the conversation. Same for
  `git push` and deploying.
- **Never add a `Co-Authored-By` trailer** (or any other author) to commit
  messages unless the repository owner explicitly asks for one. The
  existing git config (`user.name`/`user.email`) already reflects who the
  author should be — don't override it.
- Keep commit messages short (a single summary line is usually enough).

## Verifying changes before calling something done

- `npm run build` must pass cleanly before treating a change as finished —
  it chains `astro build` → `pagefind --site dist` via the `postbuild`
  script, so one command validates the whole static output plus the
  search index.
- For anything visual or interactive, actually load it — `npm run dev`
  and check in a browser/Playwright, not just a clean build.
  Type-checking and a successful build verify the code compiles, not that
  the feature looks or behaves right.
- `/cv` returning 404 on the local dev server is expected, not a bug, if
  the optional CV password gate is in use — see the "CV Password Gate"
  section in `README.md`. The gate is a PHP script and only runs on
  PHP-capable hosting, never on the local dev server.
- If the dev server seems to be serving stale content (edits not
  reflecting), don't assume the edit is wrong — check for a leftover
  process first (`ps aux | grep "astro dev"`), kill it, and restart
  cleanly rather than debugging against stale output.

## Deploying

`npm run build` produces a fully static `dist/` — deployable to any static
host. There's no host-specific deploy script here since that depends on
where the repository owner actually hosts this; ask before assuming a
target if it isn't already clear from context (a configured remote,
existing CI config, etc.).

## Where the fuller context lives

`README.md` covers what needs customizing, the CV password gate mechanics,
and the news-archiving workflow. `docs/blog-post-authoring.md` covers the
blog post schema and content-authoring gotchas. Read both before making
structural changes.
