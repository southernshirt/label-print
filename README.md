# Sample Label Studio (label-print)

A one-page web app that designs and prints sample labels on a **Brother QL-820NWB** label printer. It also prints Uline badge inserts. It's part of Southern Shirt's comp-sample system, the **Lemonade Stand Inventory** Airtable base. Each physical sample size (e.g. `COMP1036`, size M) gets a label with its ID, its product details and a QR code. Scanning the QR code opens the sample's page in Airtable.

- **Who uses it:** the Southern Shirt product development team, who print labels for incoming comp samples and for samples sent to factories. The owner is Bryan Webb.
- **Where it runs:** **https://southernshirt.github.io/label-print/** on GitHub Pages, a free static host for files in a GitHub repo. It's opened from buttons inside Airtable and works in any desktop Chrome, Edge or Safari.
- **This repo is the source of truth.** Edit the files in `src/` here. Don't edit the published page or the old copies listed under [Other copies](#other-copies-that-will-drift).

---

## Files

| Path | What it is |
|---|---|
| `index.html` | **Built output: don't edit by hand.** The single page GitHub Pages serves from `main`. `build.py` generates it from `src/`. It's committed because Pages serves the repo as-is, with no build step. |
| `src/shell.html` | The page's HTML: `<head>` (title, Google Fonts, QR library `<script>`), the top bar, the three settings tabs (Paper / Layout / Content), the green print-queue bar, the Airtable key bar and the label preview area. It contains `@include` marker lines where the CSS and JS get inserted. |
| `src/styles.css` | All styling. The `@media print` block at the bottom hides everything except the labels, and hides unselected labels. |
| `src/js/01-config.js` | Constants and default state: Brother roll sizes (`ROLLS`), Uline badge sizes (`BADGES`), the label field order (`KEYS`), field groups shown in the Content tab (`GROUPS`), text colors, `defaults()`, layout presets (`PRESETS`, including **Factory sample (no QR)**), and the settings object `S`. |
| `src/js/02-controls.js` | Builds the settings panel (roll/badge dropdowns, preset buttons, one row per field) and `syncControls()`, which makes the controls match `S`. Also handles the tabs and preview zoom. |
| `src/js/03-data.js` | Label data: `parseLabel()` (turns an Airtable "Label Data" string into an object), `readLabels()`, the queue/selection state (`queue`, `picked`, `printedIds`, `printing`), `qmsg()` for the status line, `SAMPLE` (the example label shown when nothing is loaded) and `val()` (formats MSRP as `$`). It also holds the **original Claude-connector** versions of `loadQueue()` / `clearQueue()`, which `06-standalone.js` overrides (see [How it works](#how-it-works)). |
| `src/js/04-render.js` | Drawing: `geometry()` (label size in mm from the roll/badge/orientation), `draw()` (builds each label's HTML and QR code) and `render()` (auto-fits the text size, sets the `@page` print size, writes the status lines). |
| `src/js/05-wireup.js` | Event handlers for every control, `doPrint()`, the `afterprint` handler, the queue-bar buttons and the template Save/Delete UI. It ends with the first `render()`. |
| `src/js/06-standalone.js` | What makes it work as a standalone website: templates stored in this browser (`localStorage`), the Airtable key bar, the Airtable REST API versions of `loadQueue()` / `clearQueue()`, and startup (link mode vs. queue mode, auto-print). |
| `build.py` | Joins `src/` into `index.html`. Every `/*@include file*/` or `//@include file` line in `shell.html` is replaced with that file's exact contents. `--check` verifies `index.html` is current without writing it. |
| `tests/smoke.test.mjs` | End-to-end tests in headless Chrome (Playwright). Airtable is mocked, and the tests run offline. |
| `package.json`, `package-lock.json` | Test-only dependencies: `playwright` (drives the browser) and `qrcodejs` (a local copy of the QR library, so tests don't need the CDN). The page itself has no npm dependencies. |
| `CLAUDE.md` | Short rules for Claude Code sessions working in this repo. |
| `worker/` | **Not deployed yet.** A Cloudflare Worker (`worker.js`, `wrangler.toml`, tests) that would hold one shared Airtable token, so teammates stop pasting their own keys. `page-proxy-block.js` is the matching page change. See [`worker/README.md`](worker/README.md). |

There's no framework. It's plain HTML, CSS and JavaScript loaded as one classic `<script>`, so every top-level `function`/`let`/`const` is shared across all the `src/js/*.js` files. The numbered files are simply concatenated in order, and **order matters** because later files use and override things from earlier ones.

---

## Edit, build, test

You need Python 3.8+ to build. To run the tests you also need Node 18+.

```bash
git clone https://github.com/southernshirt/label-print.git
cd label-print
npm install                      # test tools only (playwright, qrcodejs)

# 1. edit files in src/
# 2. rebuild the page
python3 build.py                 # writes index.html
# 3. test
npm test                         # build check + page smoke tests + worker unit tests
```

- **Look at it locally:** open `index.html` directly in Chrome, or run `python3 -m http.server 8000` and go to http://localhost:8000/. Add a test label with a hash, for example:
  `http://localhost:8000/#auto=0&l=COMP1|Test%20Polo|Brand|ST-1|Navy|M|https%3A%2F%2Fexample.com`
- **Chromium for tests:** if Playwright can't find a browser, run `npx playwright install chromium`, or point the tests at one with `PW_CHROMIUM=/path/to/chrome npm test`.
- **Check the build is current:** `python3 build.py --check` exits 1 if `index.html` differs from `src/`. Always commit `src/` changes and the rebuilt `index.html` together.
- **Deploy:** merge to `main`. GitHub Pages republishes `index.html` within about a minute. There's no other deploy step.

### What the tests cover (`tests/smoke.test.mjs`)

1. One label from a link renders with a QR code and auto-prints.
2. `#auto=0` stops the auto-print.
3. Several labels: no auto-print. Clicking a label unselects it, and Print sends only the selected ones.
4. `#p=factory` uses the factory preset, so there's no QR code.
5. With no key and no link, the page shows the example label, asks for a key and disables Print.
6. Queue mode: the page calls the Airtable API with the key and the right filter, prints, then **Clear printed labels from queue** sends the correct PATCH.
7. A rejected key (HTTP 401) reopens the key bar.
8. **Save template** stores the layout in `localStorage`.

`worker/worker.test.mjs` separately tests the not-yet-deployed proxy Worker: the queue paging, the origin lock, the passcode, clearing in batches of 10, and rejecting bad IDs.

`window.print()` is replaced with a recorder, so the tests check *what would print* (how many labels are on the page at print time). They don't check what the Brother actually produces.

---

## How it works

### 1. Where the label data comes from

Airtable builds one text string per sample, called **Label Data** (field `fld8vSlUXNO9AyYkI` on table 03). Fields are joined with `|` in this order, which must match `KEYS` in `src/js/01-config.js`:

```
id | name | brand | style | color | size | url | sku | category | gender | season | msrp | composition | location | sampleType | features | date
```

`url` is what the QR code encodes: the sample's page in the Airtable interface. `parseLabel()` splits the string into an object. **If you add a field, change the Airtable formula and `KEYS` together.**

The page gets labels in one of two ways.

**A. Link mode (one click).** Airtable buttons open the page with the labels in the URL *hash* (the part after `#`). The hash is never sent to a server.

| Hash parameter | Meaning |
|---|---|
| `l=<Label Data>` | One or more labels, URL-encoded, separated by `~`. `?l=` in the query string also works. |
| `p=factory` | Start from a preset whose name begins with this word: `factory`, `hangtag`, `detail`, `badge`, `qr` … |
| `t=<name>` | Start from a saved template with this name, from this browser's templates. |
| `auto=0` | Don't auto-print a single label. |

At startup (end of `06-standalone.js`), `linkLabels` is parsed from the hash and `setQueue()` loads it into `queue`. With **exactly one** label and no `auto=0`, the page waits for the fonts and calls `doPrint()`, so the print dialog opens straight away. With several labels, the user reviews them, clicks any to skip, then presses **Print**. Changing the hash reloads the page.

**B. Queue mode (batch).** In Airtable, users press **🖨 Add to print queue** on each sample, which ticks the **Print Queue** checkbox (`fldt3i65krI4cHgIM`). On this page, `loadQueue()` (the REST version in `06-standalone.js`) works like this:

- It reads the user's Airtable personal access token from `localStorage["ssco-airtable-pat"]`.
- It calls `GET https://api.airtable.com/v0/appKtpXk0YgWdp8Ac/tblwyHmt86GNwAU1m?filterByFormula={Print Queue}&fields[]=fld8vSlUXNO9AyYkI&returnFieldsByFieldId=true`, following `offset` to page through results.
- It sorts the results by Sample ID and puts them in `queue`. New records start selected.

After printing, **Clear printed labels from queue** runs `clearQueue()`. It PATCHes the printed records, 10 per request (Airtable's limit), setting Print Queue to `false`, then reloads the queue.

### 2. Choosing and drawing the layout

- `S` holds every setting:
  - media: Brother roll or Uline badge
  - roll, length mode and orientation
  - font, alignment, text scale, auto-fit and name placement
  - QR code: on/off, position, size and whether to show the ID
  - per field: on/off, size, bold, italic, color and whether to show the field name
- The controls write to `S` and call `changed()`, which calls `syncControls()` and then `render()`.
- `render()`:
  1. calls `geometry()` to get the label size in mm
  2. if **Auto-fit** is on, binary-searches the largest text scale at which `draw()` reports no overflowing labels
  3. calls `draw(..., real=true)` to build the final labels and their QR codes, using the `qrcodejs` library
  4. writes an `@page { size: W mm H mm }` rule, so the browser's print size equals the label size
- Continuous rolls (DK-22xx) with **Fit to content** grow each label to the length its content needs. Badges either tile onto 8.5 × 11 sheets with cut lines, or print one per page.

### 3. Selecting and printing

- When labels come from the queue or a link, each one is clickable. `picked` (a `Set` of record IDs) tracks which are selected.
- `doPrint()` records `printedIds`, sets `printing = true` and re-renders, so `readLabels()` returns only picked labels. Then it calls `window.print()`.
- The browser's print dialog does the rest. The user picks the Brother and turns off scaling.
- On `afterprint`, the page re-renders the full set. In queue mode it offers **Clear printed labels from queue**.

### 4. Templates

- **Save template** stores a copy of `S` under a name.
- Templates live in `localStorage["ssco-label-templates"]`, in that browser only.
- The last template used is remembered in `ssco-last-tpl` and reloaded next time, unless the link asks for a preset or template.

### Why two versions of `loadQueue` / templates exist

This page started life as a Claude artifact, a page hosted inside claude.ai. There it read the queue through Claude's Airtable connector (`mcp.callTool`) and shared templates through the artifact's database (`db`). That code is still in `03-data.js` and `05-wireup.js`. `06-standalone.js` runs last and **replaces** it:

- `db` becomes a small `localStorage` shim with the same `collection().doc().set()` shape.
- `loadQueue` and `clearQueue` are reassigned to `fetch()` versions.
- The Refresh and Clear buttons are re-bound to the new functions.

On this site `mcp` is always `null`, so the connector code never runs. It was kept so the split source rebuilds byte-for-byte into the page that's live today. Removing it is a reasonable first cleanup (see [Ideas](#ideas-not-built-yet)).

---

## Features

- **Paper:**
  - 16 Brother DK rolls, die-cut and continuous. The default is DK-1209 (1.1" × 2.4"); DK-1201 (1.1" × 3.5") is also common.
  - Continuous rolls can use a fixed length or fit to content.
  - Landscape or portrait.
- **Uline badge inserts:** five sizes, tiled onto letter paper with cut lines, or one per page.
- **Layout presets:** Factory sample (no QR), Hangtag, Detail tag, Badge vertical, Badge horizontal, Details only, QR only.
- **Text:**
  - 17 data fields in 7 groups.
  - Each field can be turned on or off, with its own size, bold, italic, one of five colors, and an optional field-name prefix.
  - Eight font choices and three alignments (left, center, right).
  - The name can go across the top or inline with the other fields.
- **Auto-fit:**
  - Picks the largest text that fits.
  - Lets a long name wrap to two lines rather than shrink below about 8 pt.
  - Outlines any label that's still cut off in red.
- **QR code:** on/off, left/right/top position, size, and the Sample ID shown under it. It warns when the code is under about 0.5" (hard for phones to scan).
- **Click-to-print** from Airtable: a single label auto-prints.
- **Factory label** with no QR, for samples sent to manufacturers.
- **Print queue** from Airtable: select all or none, click to skip, print only the selected labels, then clear them from the queue.
- **Saved templates** in the browser, reusable by name in links (`#t=`).
- **Airtable key bar** with a "Paste from clipboard" button. The key is stored only in this browser and can be forgotten with one click.

---

## Environment-specific behavior

| Situation | What happens |
|---|---|
| **This site (GitHub Pages)** | Everything works. Printing uses the browser's normal print dialog. |
| **Opened as a local file or localhost** | Works the same. Queue mode works too, if the key is saved in that browser; localhost counts as a separate browser storage area from the live site. |
| **Inside a Claude artifact** (the old version) | `window.print()` is blocked, because the artifact frame is sandboxed without permission to show print dialogs. That's why the page moved here. |
| **No Brother driver installed** | The print dialog only offers "Save as PDF". Each computer needs the Brother QL-820NWB driver; on a Mac, the printer must also be added in System Settings → Printers & Scanners. |
| **Phones / tablets** | The page loads, but label printing is meant for a desktop with the printer driver installed. |
| **Templates** | Saved per browser. A template saved on one computer isn't visible on another, or in another browser on the same computer. |
| **Clipboard button** | Some browsers block reading the clipboard. The page then says to click the box and press Cmd+V. |

---

## External dependencies

| Dependency | Used for | Notes |
|---|---|---|
| `cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` | Drawing QR codes | The global `QRCode` object. If it fails to load, labels with a QR code throw an error. |
| Google Fonts (Inter, Montserrat, Oswald, Roboto Condensed, Roboto Mono, Libre Baskerville) | Label and UI fonts | Falls back to system fonts if blocked. |
| **Airtable REST API** `api.airtable.com` | Queue mode only | Base `appKtpXk0YgWdp8Ac`, table `tblwyHmt86GNwAU1m`. Calls come straight from the browser. |
| **Airtable personal access token** | Queue mode only | Each user makes their own at https://airtable.com/create/tokens with scopes **data.records:read** and **data.records:write**, access limited to **Lemonade Stand Inventory**. Stored only in that browser's `localStorage`. **Never commit a token**: this repo is public. |
| GitHub Pages | Hosting | Serves `index.html` from `main`. |

Link mode needs no key and no API access: all the data is in the link.

### Airtable side (what points at this page)

These settings live in Airtable, not in this repo. Change them in Airtable if the URL or hash format changes.

**Base `appKtpXk0YgWdp8Ac`, table 03 (Comp-Samples-(C), `tblwyHmt86GNwAU1m`):**
- **🖨 Print Label** (`fldg9OpxDQlc36bim`), a formula: `"https://southernshirt.github.io/label-print/#l=" & ENCODE_URL_COMPONENT({Label Data})`
- **🏭 Print Factory Label** (`fldUrubhQpCLiPUSN`): the same formula, with `#p=factory&l=`
- **Print** (`fldiQTsbRTgyvpzFl`): a button field with the same URL as 🖨 Print Label
- **Print Queue** (`fldt3i65krI4cHgIM`), a checkbox
- **Label Data** (`fld8vSlUXNO9AyYkI`), a formula

**Table 02 (Comp-Samples-(P), `tblFXkCwv0MkHtrCL`):**
- **🖨 Print All Size Labels** (`fldhV3UuKzcbfDgL0`), a rollup of Label Data through Sizes: `"https://southernshirt.github.io/label-print/#l=" & ENCODE_URL_COMPONENT(ARRAYJOIN(values, "~"))`

**Interface "Sample Library" (`pbdmnxQJK4qZi0AkY`):**
- **07_Label Studio** page (`pagyNuNRCry5cFiEX`): links to this site and to the Wiki article "Print labels"
- **03_Comp-Samples-(C)** page: an "🖨 Open Label Studio" button
- **Sample Size Detail** page (`pagAQC1D4Ob7fu30S`): "🖨 Add to print queue" and "🖨 Label Studio" buttons

**Wiki** (table `tblJa2BSy0bHfuJCI`): the articles "Print labels" and "Setup: install the apps for scanning and printing" describe the user steps. Update them when the steps change.

---

## Known issues, limits and decisions

- **Hosted on GitHub Pages, not as a Claude artifact.** Claude artifacts can't open the print dialog (see above). A public static host was the simplest place where `window.print()` works and that anyone can open from Airtable without signing in.
- **The repo and the site are public.** No secrets live here. The Airtable base, table and field IDs are visible, but they're useless without a token. Data only enters the page through the link a user clicks, or through their own token.
- **Each user brings their own Airtable token** today, because a shared key embedded in a public page would be exposed. The cost is a setup step per person, per browser, and that's the main complaint. **The planned fix is the proxy Worker in `worker/`:** it holds one token server-side, and the page calls it instead of Airtable. It's coded and tested but not deployed. It was also sent to Clay Dunston (IT) on 2026-10-01, so ask him whether it already exists before deploying. Open decisions are whether to use a team passcode and who owns the Cloudflare account. See `worker/README.md`.
- **Old tokens should be retired** when the Worker goes live. Notes from another Claude session say a token was pasted into a chat on 2026-10-01; treat it as exposed and regenerate or delete it at https://airtable.com/create/tokens.
- **The token is kept in `localStorage`** (the browser's per-site storage): readable by scripts on this site, and lost if site data is cleared. A text input (not a password field) plus a paste button was chosen because users couldn't paste into the hidden password field.
- **Airtable PATCH is limited to 10 records per request**, so clearing runs in batches of 10.
- **Interface "Go to external URL" buttons in Airtable only take a fixed URL.** Per-record links must therefore come from formula or button fields, which is why the 🖨 Print Label formula exists.
- **`index.html` is committed build output.** Pages serves files as-is, and adding a CI build was more machinery than this needs. `npm test` runs `build.py --check` to catch a stale `index.html`.
- **The old Claude-connector code is still in `src/`**, unused on this site, so the first split matched the live page byte-for-byte.
- **Long link URLs:** "Print All Size Labels" puts every size's label data in one URL. Browsers handle URLs tens of thousands of characters long, but a style with very many sizes and long feature text could hit Airtable's or the browser's limits.
- **No automated check of real printer output.** Sizes were set from Brother's DK roll dimensions and checked by printing on the QL-820NWB.

## Ideas not built yet

- **Deploy the shared-token proxy** (`worker/`). It's written and tested, but deploying needs a Cloudflare account and a decision from Bryan; see `worker/README.md`.

- **Share templates across the team**, for example in a "Label Templates" Airtable table read and written with the user's token, instead of per-browser `localStorage`.
- **Remove the dead Claude-connector code** (`mcp`, `mcpErrorText`, the first `loadQueue`/`clearQueue`, and the `db` template code) and fold `06-standalone.js` into the files it overrides.
- **Bring over the label layout editor from SSCO Stockroom**, a separate Sortly-style inventory artifact whose handoff is in the "App Builds" claude.ai project under `ssco-stockroom/`. That editor offers free-form label templates.
- **Let SSCO Stockroom print through this page**, by passing its labels in the hash, since that artifact can't open a print dialog either.
- **Vendor the QR library** (serve `qrcode.min.js` from this repo) so the page doesn't depend on cdnjs.
- **Delete the old Claude artifact** once everyone uses this site.

---

## Other copies that will drift

After this repo was set up, these copies exist but **are not maintained**. Edit only this repo.

- **The old Claude artifact "Sample Label Studio"**, https://claude.ai/artifact/VvavUUS8q2cjerEZG8Zmth. It's the earlier version that saves a PDF instead of printing. Nothing in Airtable links to it any more.
- **claude.ai project "App Builds"**: `label-print/index.html` is a snapshot of the built page as of 2026-11-19, and `label-print/CLAUDE.md` is an earlier handoff note.
- **Cowork session outputs** (`label-print/index.html` in that session's files): the same snapshot.
- **claude.ai project "App Builds", `claude/label-print-handoff.md`:** notes from a separate session about the proxy Worker. Their contents are merged into `worker/`.
- **Bryan's computer, `~/Downloads/label-print-setup/`:** per those notes, a `worker.js`, an edited `index.html` and a PDF of the IT setup guide.
- **The Claude doc "Label Print: Shared Airtable Key Setup"** (https://claude.ai/code/artifact/89f622de-a895-4551-89c4-b98caf175089): the IT setup guide for the Worker.
- **Slack message to Clay Dunston, 2026-10-01:** the same Worker code and setup steps.
