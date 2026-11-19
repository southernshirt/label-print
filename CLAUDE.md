# CLAUDE.md: label-print

Read `README.md` first. It explains the files, the build, and how the page and Worker fit together.

## Rules

- **Never commit to `main`.** `main` is what GitHub Pages serves live. Work on a branch and open a PR.
- **Edit `src/`, never `index.html` by hand.** After any change, run `node build.mjs`, then commit `src/` and `index.html` together.
- **Before every commit:** run `node test/run.mjs` (it must pass) and `node build.mjs --check`. If Playwright is available, also run `node test/browser.mjs`.
- **Keep JS files in `src/js/` numbered.** The build joins them in name order into one `<script>`, so they share one global scope.
- **No secrets in the repo.** It's public. The Airtable token lives only in the Cloudflare Worker (`wrangler secret put AIRTABLE_TOKEN`). Don't add `.dev.vars` or any `pat…` string.
- **Keep the page dependency-free** (plain HTML/CSS/JS, no framework, no bundler). Keep `build.mjs` working with Node alone.
- **Don't break single-label links** (`#l=…`, `#p=…`, `#t=…`, `&auto=0`). Airtable's 🖨 Print label button depends on them.
- **Airtable IDs** are in `src/js/03-data.js` (`AT`) and `worker/index.js`. Change them in both places.
- **Plain language** in any text people see. Units in inches.
