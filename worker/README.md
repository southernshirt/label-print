# Label print proxy (Cloudflare Worker): designed, NOT deployed

**Goal:** stop every teammate from having to paste their own Airtable key into Label Studio. The proxy is a small Cloudflare Worker that holds **one** Airtable token as a secret. The page calls the Worker, and the Worker calls Airtable. No token ever reaches a browser or this public repo.

A **Cloudflare Worker** is a small JavaScript function that Cloudflare runs on its servers at a URL like `https://ssco-label-proxy.<subdomain>.workers.dev`. It's free at this volume. `wrangler` is Cloudflare's command-line tool for deploying Workers.

**Status, 2026-11-19:**

- The Worker code and the page change are written and tested against mocks.
- The live page still uses the per-person key (`src/js/06-standalone.js`).
- The Worker and its setup steps were also sent to **Clay Dunston (IT)** in Slack on 2026-10-01. Nobody has confirmed whether he deployed it, so **ask Clay before creating a second one.**
- The design came from a separate Claude session. Its notes are in the App Builds claude.ai project at `claude/label-print-handoff.md`, and there's a setup guide for IT, the Claude doc "Label Print: Shared Airtable Key Setup": https://claude.ai/code/artifact/89f622de-a895-4551-89c4-b98caf175089

## Files

| File | What it is |
|---|---|
| `worker.js` | The Worker. Two endpoints, CORS locked to the GitHub Pages origin, optional team passcode. |
| `wrangler.toml` | Worker name, entry file and the `ALLOWED_ORIGINS` variable. It contains no secrets. |
| `worker.test.mjs` | Unit tests: `node worker/worker.test.mjs`. Airtable is mocked through `globalThis.fetch`. |
| `page-proxy-block.js` | The drop-in replacement for the queue section of `src/js/06-standalone.js` once the Worker is live. |

## What the Worker does

- **Secrets:**
  - `AIRTABLE_TOKEN` (required): a **new** personal access token with only `data.records:read` and `data.records:write`, limited to the Lemonade Stand Inventory base. Bryan creates it.
  - `TEAM_CODE` (optional): a passcode the page sends in the `X-Team-Code` header.
- **Variable:** `ALLOWED_ORIGINS = https://southernshirt.github.io`. This is an origin only, no path; separate several with commas.
- **`GET /queue`** returns `{records:[{id, label}]}` for every record with Print Queue ticked. It pages through Airtable for you.
- **`POST /clear` with body `{ids:[...]}`** unticks Print Queue on those records. It accepts at most 500 IDs, each matching `^rec[A-Za-z0-9]{14}$`, and sends them to Airtable in batches of 10.
- **Error responses:**
  - 403: any other origin
  - 401: wrong passcode
  - 500: token missing
  - 502: Airtable error
  - 404: anything else

## Deploy (when Bryan decides; check with Clay first)

```bash
cd worker
npx wrangler login                      # opens a browser; the account owner signs in
npx wrangler secret put AIRTABLE_TOKEN  # paste the new token when prompted (never into a file or chat)
npx wrangler secret put TEAM_CODE       # optional
npx wrangler deploy                     # prints the Worker URL
```

Then:

1. Copy `page-proxy-block.js` over the section of `src/js/06-standalone.js` that starts at
   `// ---------- labels: from the link, or from the Airtable queue with the viewer's own key ----------`
   and ends just before `// rebind buttons to the standalone versions`. Set `PROXY` to the Worker URL.
2. In `src/shell.html`:
   - Rename the `#qkey` button from "Airtable key" to "Team passcode".
   - Change the `#keybar` text to "Enter the team passcode from Bryan. It is saved in this browser, so you only enter it once."
   - Set the input placeholder to "Team passcode".
   - If there's no `TEAM_CODE`, hide `#qkey` (add `is-hidden`).
3. Update `tests/smoke.test.mjs`: queue tests should mock the Worker URL, not `api.airtable.com`.
4. Run `python3 build.py && npm test`, open a PR, and merge once it's verified.
5. Update the Airtable Wiki article "Print labels" (remove the "make your own token" steps).
6. **Delete the old per-person tokens** at https://airtable.com/create/tokens. That includes the token the other session's notes say Bryan pasted into a chat on 2026-10-01, which should be treated as exposed.

The block also removes any old `ssco-airtable-pat` key saved in a user's browser.

## Verify before calling it done

- [ ] `node worker/worker.test.mjs` passes.
- [ ] `curl -i -H "Origin: https://southernshirt.github.io" <worker>/queue` returns 200 with `records`, and `-H "Origin: https://example.com"` returns 403.
- [ ] Tick Print Queue on 1–2 samples, then open the page in a private window: the queue loads with no key prompt (or one passcode prompt).
- [ ] Print, then press **Clear printed labels from queue**: the boxes untick in Airtable.
- [ ] A single-label link (`#l=…`) from a sample's 🖨 button still prints.
- [ ] `git grep -nE "pat[A-Za-z0-9]{14}\."` finds nothing, so there's no token in the repo.

## Open decisions for Bryan

- **Passcode or not.**
  - Without one, nobody types anything. But anyone who finds the Worker URL in this public repo could read the queued labels and untick Print Queue.
  - Either way, they still can't get the token or reach any other data.
- **Who deploys and owns the Cloudflare account:** Bryan, using Claude Code, or Clay (IT).
