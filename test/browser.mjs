// Optional end-to-end check in a real (headless) Chromium. Needs Playwright:
//   npm install --no-save playwright && npx playwright install chromium
//   node test/browser.mjs
// It serves index.html as if from GitHub Pages and fakes the label proxy, so it
// never touches Airtable or Cloudflare.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("Playwright isn't installed. Run: npm install --no-save playwright"); process.exit(2); }

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = readFileSync(join(root, "index.html"), "utf8");
const PAGE = "https://southernshirt.github.io/label-print/";
const PROXY = "https://proxy.test";
const LABEL = (id, name) => [id, name, "Brand", "ST-1", "Navy", "M", "https://example.com/" + id, "SKU1", "K - Polo", "Mens", "SS27", "68", "100% Cotton", "Rack A", "Competitor", "UPF 50", "09/12/26"].join("|");

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let passed = 0;
const ok = (n) => { passed++; console.log("  ok  " + n); };

// If the machine can't reach cdnjs, set QRCODE_JS to a local copy of
// qrcodejs 1.0.0 (e.g. from `npm pack qrcodejs@1.0.0`) and it is served instead.
async function routeQrLib(page) {
  if (!process.env.QRCODE_JS) return;
  const lib = readFileSync(process.env.QRCODE_JS, "utf8");
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/**", r => r.fulfill({ contentType: "application/javascript", body: lib }));
}

async function open(html, hash = "", proxy = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  // window.print() would block headless Chromium: fire afterprint instead.
  await page.addInitScript(() => { window.print = () => setTimeout(() => window.dispatchEvent(new Event("afterprint")), 50); });
  await page.route(PAGE + "**", r => r.fulfill({ contentType: "text/html", body: html }));
  await routeQrLib(page);
  await page.route(PROXY + "/**", async r => {
    const req = r.request();
    const h = { "Access-Control-Allow-Origin": "https://southernshirt.github.io", "Access-Control-Allow-Headers": "Content-Type, X-Team-Code", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: h });
    const res = await proxy.handle(req);
    return r.fulfill({ status: res.status, headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(res.body) });
  });
  await page.goto(PAGE + hash);
  await page.waitForTimeout(800);
  return { page, errors };
}

// A. As committed (proxy address not set yet): no crash, clear message.
{
  const { page, errors } = await open(built);
  const msg = await page.textContent("#qmsg");
  assert.match(msg, /isn't connected yet/);
  assert.deepEqual(errors, []);
  ok("placeholder proxy: shows 'not connected yet', no JS errors");
  await page.close();
}

// B. Single label from a link (what a sample's print button opens).
{
  const { page, errors } = await open(built, "#l=" + encodeURIComponent(LABEL("COMP1001", "Link Polo")) + "&auto=0");
  assert.equal(await page.locator("#sheet .label").count(), 1);
  assert.match(await page.textContent("#sheet"), /Link Polo/);
  assert.ok(await page.locator("#sheet .code canvas, #sheet .code img").count() > 0, "QR code drawn");
  assert.deepEqual(errors, []);
  ok("link label: renders one label with name and QR code");
  await page.close();
}

// C. Print queue through the proxy, with a team passcode.
{
  const html = built.replace("https://ssco-label-proxy.YOUR-SUBDOMAIN.workers.dev", PROXY);
  const seen = [];
  const proxy = { handle: async (req) => {
    const code = req.headers()["x-team-code"] || "";
    seen.push({ method: req.method(), url: req.url(), code, body: req.postData() });
    if (code !== "letmein") return { status: 401, body: { error: "code" } };
    if (req.url().endsWith("/queue")) return { status: 200, body: { records: [
      { id: "recBBBBBBBBBBBBBB", label: LABEL("COMP1002", "Queue Tee") },
      { id: "recAAAAAAAAAAAAAA", label: LABEL("COMP1001", "Queue Polo") } ] } };
    if (req.url().endsWith("/clear")) return { status: 200, body: { cleared: JSON.parse(req.postData()).ids.length } };
    return { status: 404, body: {} };
  } };
  const { page, errors } = await open(html, "", proxy);
  assert.ok(await page.isVisible("#keybar"), "asks for passcode after 401");
  assert.ok(!seen.some(s => /authorization/i.test(JSON.stringify(s))), "no token sent by the page");
  ok("passcode set on the Worker: page asks for it once");

  await page.fill("#keyin", "letmein");
  await page.click("#keysave");
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#sheet .label").count(), 2);
  assert.match(await page.textContent("#qmsg"), /2 labels in the print queue/);
  const first = await page.locator("#sheet .label .sid").first().textContent();
  assert.equal(first, "COMP1001", "sorted by Sample ID");
  assert.equal(await page.evaluate(() => localStorage.getItem("ssco-label-team-code")), "letmein");
  ok("queue loads through the proxy, sorted by Sample ID, passcode remembered");

  await page.click("#print");
  await page.waitForTimeout(400);
  assert.ok(await page.isVisible("#qclear"), "clear button offered after print");
  await page.click("#qclear");
  await page.waitForTimeout(600);
  const clear = seen.find(s => s.url.endsWith("/clear"));
  assert.ok(clear, "POST /clear sent");
  assert.deepEqual(JSON.parse(clear.body).ids.sort(), ["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"]);
  ok("print then clear: sends exactly the printed record ids to /clear");

  await page.reload(); await page.waitForTimeout(800);
  assert.ok(!(await page.isVisible("#keybar")), "no prompt on second visit");
  ok("second visit: no passcode prompt");
  assert.deepEqual(errors, []);
  await page.close();
}

// D. Old per-browser key is removed on load.
{
  const html = built.replace("https://ssco-label-proxy.YOUR-SUBDOMAIN.workers.dev", PROXY);
  const page = await browser.newPage();
  await page.route(PAGE + "**", r => r.fulfill({ contentType: "text/html", body: html }));
  await routeQrLib(page);
  await page.route(PROXY + "/**", r => r.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }, contentType: "application/json", body: '{"records":[]}' }));
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.setItem("ssco-airtable-pat", "old"));
  await page.reload(); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => localStorage.getItem("ssco-airtable-pat")), null);
  ok("old saved Airtable key is deleted from the browser");
  await page.close();
}

await browser.close();
console.log(`\n${passed} browser checks passed`);
