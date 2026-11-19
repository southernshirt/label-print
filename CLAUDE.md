# CLAUDE.md: label-print (Sample Label Studio)

Read `README.md` first. It explains the files, the build, the Airtable wiring and the decisions.

## Rules
- Edit only `src/` and the tooling. **Never hand-edit `index.html`**: regenerate it with `python3 build.py` and commit it together with the `src/` change.
- Before committing, run `npm test`, which does `build.py --check` plus the Playwright smoke tests.
- Keep `KEYS` in `src/js/01-config.js` in the same order as the Airtable "Label Data" formula. If you change it, say so, because Airtable must change too.
- This repo and its site are **public**. Never commit tokens, keys or personal data.
- Work on a branch and open a PR. Merging to `main` publishes to https://southernshirt.github.io/label-print/ immediately.
- Bryan's standing rules:
  - Ask before downloading, installing, deleting, sharing or publishing anything, including merges to `main` and Airtable changes.
  - Stop and let him sign in wherever a login is needed.
  - Never handle his tokens; users paste their own.
- `worker/` is a designed but **undeployed** Cloudflare Worker. Don't deploy it, or switch the page to it, without Bryan's go-ahead, and check with Clay Dunston (IT) first. Never put a token in `wrangler.toml` or any file; use `wrangler secret put`.
