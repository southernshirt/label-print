# Sample Label Studio (label-print)

A one-page web app that prints sample labels for Southern Shirt's sample room. It prints to a **Brother QL-820NWB** label printer, or on **Uline badge inserts** from a regular printer. The label data comes from the **Lemonade Stand Inventory** Airtable base.

- **Who uses it:** the product development team (Bryan Webb, Angelina Kim and others) when samples come in.
- **Where it runs:** GitHub Pages, from this repo's `main` branch: `https://southernshirt.github.io/label-print/` (confirm under repo **Settings → Pages**).
- **How people open it:**
  - **One sample:** the 🖨 *Print label* button on a sample in Airtable opens the page with that sample's label in the link, and it prints right away.
  - **Several samples:** tick **Print Queue** on samples in Airtable, open the page, and it lists every queued label.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | **Generated.** The page GitHub Pages serves. Don't edit it by hand; run the build. |
| `src/head.html` | `<!doctype>`, `<head>`, page title, Google Fonts link, the QR-code library `<script>` from cdnjs |
| `src/styles.css` | All CSS, including print rules (`@media print`) |
| `src/body.html` | The page markup: top bar, Paper/Layout/Content tabs, queue bar, passcode bar, preview area |
| `src/js/01-setup.js` | Constants and state: label rolls (`ROLLS`), badge sizes (`BADGES`), label fields (`KEYS`, `GROUPS`), layout presets (`PRESETS`), `defaults()`, the global state `S` |
| `src/js/02-controls.js` | Builds the controls and keeps them in sync with `S` (`buildGroups`, `syncControls`, tabs, zoom) |
| `src/js/03-data.js` | Airtable IDs (`AT`), queue state (`queue`, `picked`, `printedIds`), `parseLabel`, `readLabels`, `qmsg`, example label (`SAMPLE`). Also the original Claude-artifact versions of `loadQueue`/`clearQueue`, which `06` replaces. |
| `src/js/04-render.js` | Label layout and drawing: `geometry()`, `draw()`, `render()` (auto-fit text, overflow warnings, `@page` size) |
| `src/js/05-print-templates.js` | Control event wiring, `doPrint()`, select/clear buttons, and saved templates (`load`, `fillTemplates`, save/delete) |
| `src/js/06-standalone.js` | GitHub Pages behavior: templates stored in the browser, link parameters, the label proxy calls (`PROXY`, `loadQueue`, `clearQueue`), team passcode, and startup |
| `build.mjs` | Joins `src/` into `index.html`. No dependencies. |
| `worker/index.js` | Cloudflare Worker "label proxy": holds the Airtable token and reads/clears the print queue for the page |
| `worker/wrangler.toml` | Worker settings for Cloudflare's `wrangler` tool (name, allowed site) |
| `test/run.mjs` | Fast checks with no dependencies: build up to date, script parses, no token in the page, Worker behavior against a fake Airtable |
| `test/browser.mjs` | Optional end-to-end checks in headless Chromium (needs Playwright) |
| `package.json` | Shortcuts: `npm run build`, `npm run check`, `npm test`. No packages to install. |
| `CLAUDE.md` | Rules for Claude Code working in this repo |

## Edit, build, test

You need Node.js 18 or newer. Nothing to install for the build or the basic tests.

```bash
git clone https://github.com/southernshirt/label-print.git
cd label-print
git checkout -b my-change        # never commit straight to main; main is what's live

# 1. edit files in src/ (or worker/)
# 2. rebuild the page
node build.mjs                   # writes index.html
# 3. test
node test/run.mjs                # must print "... checks passed"
node build.mjs --check           # fails if index.html wasn't rebuilt
```

To look at it, open `index.html` in Chrome. Add a label in the link to see one:

```
index.html#l=COMP1001|Example Polo|Brand|ST-1|Navy|M|https://example.com|SKU1|K - Polo|Mens|SS27|68|100% Cotton|Rack A|Competitor|UPF 50|09/12/26&auto=0
```

`&auto=0` stops it from opening the print dialog straight away.

The optional browser test runs the real page in headless Chrome, fakes the proxy, and checks the queue, passcode, print and clear flow:

```bash
npm install --no-save playwright && npx playwright install chromium
node test/browser.mjs
# If the machine can't reach cdnjs: QRCODE_JS=/path/to/qrcode.min.js node test/browser.mjs
```

Commit both `src/` and the rebuilt `index.html`. GitHub Pages only serves `index.html`.

## How it works

1. **Startup** (`06-standalone.js`, last lines). The page reads the link's `#` part (`HP`):
   - `l=` holds one or more labels, separated by `~`. Each label is the pipe-separated string described below.
   - `p=` picks a preset (`factory`, `hangtag`, `detail`, `badge`, `qr`…).
   - `t=` picks a saved template by name.
   - `auto=0` turns off automatic printing.
   If there are labels in the link, it shows them. With exactly one label, it calls `doPrint()` after fonts load. With none, it calls `loadQueue()`.
2. **Label data.** Airtable builds one text field per sample (`fld8vSlUXNO9AyYkI`) in a fixed order: `id|name|brand|style|color|size|url|sku|category|gender|season|msrp|composition|location|sampleType|features|date`. `parseLabel()` splits it into an object using `KEYS`. The QR code encodes `url`, falling back to `id`.
3. **Print queue.** `loadQueue()` calls `GET {PROXY}/queue` and sends the saved team passcode as an `X-Team-Code` header. The Worker returns `{records:[{id,label}]}`. Labels are sorted by Sample ID, and new ones start selected. A 401 response opens the passcode bar.
4. **Settings → picture.** All settings live in one object, `S` (paper, roll, orientation, font, QR position and size, and per-field size/bold/italic/color). Every control calls `changed()`, which runs `syncControls()` then `render()`.
5. **Rendering.** `geometry()` works out the label size in mm from the roll or badge and the orientation. `draw()` builds each label as HTML, with real QR codes from `QRCode` (qrcodejs). With **Auto-fit** on, `render()` binary-searches the largest text scale where nothing overflows. If a one-line name would drop below 8 pt, it lets the name wrap instead. Labels that still overflow get a red outline and a warning. `render()` also writes a `@page` size rule, so the browser prints at the exact label size, or on letter-size sheets for tiled badges.
6. **Printing.** `doPrint()` records the selected records in `printedIds`, renders only those, and calls `window.print()`. After printing, the **Clear printed labels from queue** button appears. `clearQueue()` sends `POST {PROXY}/clear {ids}`, and the Worker unticks Print Queue in Airtable in batches of 10.
7. **Templates.** **Save template** stores the current `S` under a name in this browser's `localStorage` (`ssco-label-templates`). `06` provides a small `db` object that looks like the Claude artifact database, so the same save/delete code works.
8. **The Worker** (`worker/index.js`). It only accepts calls from the sites in `ALLOWED_ORIGINS` (CORS). It checks `TEAM_CODE` if one is set. Then it calls the Airtable REST API with the secret `AIRTABLE_TOKEN`. It can only list the queue (`GET /queue`) and untick Print Queue (`POST /clear`, only valid `rec…` IDs, max 500).

**Plain-terms glossary:**
- **GitHub Pages** hosts the static `index.html` from this repo for free.
- A **Cloudflare Worker** is a small piece of JavaScript Cloudflare runs on its servers. It can keep secrets that a public web page can't.
- **CORS** is the browser rule that lets the Worker say which websites may call it.
- **wrangler** is Cloudflare's command-line tool for deploying Workers.

## Features

- **Brother QL-820NWB rolls:**
  - Die-cut: DK-1209, 1201, 1208, 1202, 1204, 1203, 3235, 1221 square, 1218/1219 round.
  - Continuous: DK-2205, 2251 black/red, 2113 clear, N5224, 2223, 2210.
  - Landscape or portrait.
  - Continuous rolls can **fit length to content** or use a set length in inches.
- **Uline badge inserts:** 3×2, 2×3, 4×3, 3×4 and 4×6 in. Print tiled on letter paper with cut lines, or one per page.
- **Layout presets:** Factory sample (no QR), Hangtag, Detail tag, Badge vertical/horizontal, Details only, QR only.
- **QR code:** on/off, left/right/top, size, Sample ID under the QR. Shows a warning when it gets too small to scan easily.
- **Text:**
  - 8 fonts and alignment.
  - Name across the top or inline.
  - Scale all text, or **auto-fit** to the label.
- **17 fields in 7 groups** (Identity, Tracking, Size & color, Classification, Price, Materials & features, Storage). Each has its own on/off, size in pt, bold, italic, color, and "show field name".
- **Preview:** zoom 100/150/200%, overflow highlighted in red, label size shown in inches.
- **Print queue:**
  - Click labels to include or skip them, or use Select all / Select none.
  - Refresh, and clear printed labels from Airtable.
- **One-click single label** from Airtable through the link.
- **Saved templates** (per browser), plus link parameters for preset or template.

## Environment differences

| Where | What works | What doesn't |
| --- | --- | --- |
| GitHub Pages (this repo) | Everything above, once the Worker is deployed and `PROXY` is set | Templates are saved **only in that browser**; the button says "Save template" and the message says "on this computer" |
| Opened as a local file (`file://`) | Link labels, layout, printing | Print queue: the Worker only answers the sites in `ALLOWED_ORIGINS` (add `null` there only for local testing) |
| Claude artifact "Sample Label Studio" (separate copy, see below) | Reads the queue through each viewer's own Airtable connector in Claude (no key, no Worker); templates shared with everyone | Can't open the print dialog, so it saves a PDF to print instead |

The Claude-only code is still in `03-data.js` (`mcp`, `mcpErrorText`, the first `loadQueue`/`clearQueue`). On GitHub Pages `mcp` is always `null`, and `06` replaces those functions. It's harmless, but it's dead code here.

## External dependencies

- **qrcodejs 1.0.0** from `cdnjs.cloudflare.com`. If it can't load, the page breaks with `QRCode is not defined`.
- **Google Fonts** (Inter, Montserrat, Oswald, Roboto Condensed, Roboto Mono, Libre Baskerville). If they can't load, the page falls back to system fonts.
- **Cloudflare Worker `ssco-label-proxy`** (in `worker/`), with these settings:
  - `AIRTABLE_TOKEN` (secret, required): an Airtable personal access token. Give it only the `data.records:read` and `data.records:write` scopes, and access to the **Lemonade Stand Inventory** base only.
  - `TEAM_CODE` (secret, optional): a team passcode. If it's set, each person types it once per browser.
  - `ALLOWED_ORIGINS` (variable): `https://southernshirt.github.io`.
- **Airtable** base `appKtpXk0YgWdp8Ac`, table Inventory List `tblwyHmt86GNwAU1m`, label field `fld8vSlUXNO9AyYkI`, checkbox **Print Queue** `fldt3i65krI4cHgIM`. The Worker filters with the formula `{Print Queue}`, so renaming that field breaks the queue.

### Deploying the Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put AIRTABLE_TOKEN     # paste the token when asked; never commit it
npx wrangler secret put TEAM_CODE          # optional
npx wrangler deploy                        # prints the Worker URL
```

Then set `PROXY` near the top of the proxy section in `src/js/06-standalone.js` to that URL. Rebuild, test, commit, and merge. Until `PROXY` is set, the page says the queue "isn't connected yet", and single-label links still work.

## Known issues, limits, decisions

- **Why a Worker:** the old version asked every person to paste an Airtable token, saved only in their own browser. People had to redo it on every computer, and tokens ended up spread around. The repo is public, so the token can never go in the page. The Worker keeps one token on Cloudflare.
- **Passcode is optional:** without it, nobody types anything. The catch is that anyone who finds the Worker URL in this public repo could read the queued labels or untick Print Queue. They still couldn't get the token or touch any other Airtable data.
- **Merge order matters:** GitHub Pages publishes `main`. Merging this branch before the Worker exists and `PROXY` is set turns off the queue (it shows "not connected yet"). Single-label links keep working.
- **Templates are per browser** on GitHub Pages; they aren't shared with the team.
- **The Brother printer only prints black,** plus red on DK-2251 rolls. Other colors print as black or gray.
- **Print at 100%** (Actual size) in the print dialog, or labels come out scaled.
- **Tiled badge pages** assume 8.5×11 in paper with 0.5 in margins.
- **Very small QR codes** (under about 0.5 in) can be hard for phones to scan; the page warns about this.
- **Tests:** the browser test serves qrcodejs from an npm copy (`npm pack qrcodejs@1.0.0`) when cdnjs is blocked. That copy is the same library but may not be byte-identical to cdnjs's file.

## Ideas not built yet

- Share templates across the team, for example a `GET/PUT /templates` route on the Worker backed by Cloudflare KV.
- Bundle qrcodejs into the repo so the page doesn't depend on cdnjs.
- Remove the dead Claude-artifact code from `03-data.js`.
- Move `PROXY` and the Airtable IDs into a small config file.
- Print history or a "reprint last batch" button.

## Other copies (they don't update from this repo)

- Claude artifact **Sample Label Studio**: https://claude.ai/artifact/VvavUUS8q2cjerEZG8Zmth (Claude-connector version)
- `~/Downloads/label-print-setup/` on Bryan's Mac: `index.html`, `worker.js`, PDF/handoff (the files sent to Clay on 2026-10-01)
- Claude doc **Label Print: Shared Airtable Key Setup** (IT setup steps): https://claude.ai/code/artifact/89f622de-a895-4551-89c4-b98caf175089

**This repo is the source of truth.** Make changes here.
