// Smoke tests for Label Studio. They open the built index.html in headless
// Chromium (Playwright) and check the main flows end to end.
//
// Run:  python3 build.py && node tests/smoke.test.mjs
// Needs: Node 18+, `npm install` (installs playwright + the qrcodejs copy used
// below), and a Chromium for Playwright (`npx playwright install chromium`,
// or set PW_CHROMIUM=/path/to/chromium).
//
// Nothing here touches the real Airtable: api.airtable.com is mocked, the QR
// library is served from node_modules instead of the CDN, and Google Fonts are
// blocked so the tests run offline. window.print() is stubbed to record calls.
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = pathToFileURL(path.join(ROOT, "index.html")).href;
const QR_LIB = readFileSync(path.join(ROOT, "node_modules/qrcodejs/qrcode.min.js"), "utf8");
const QUEUE_FIELD = "fldt3i65krI4cHgIM";
const LABEL_FIELD = "fld8vSlUXNO9AyYkI";

// Same field order as KEYS in src/js/01-config.js
const label = (id, size, url = "https://airtable.com/x/" + id) =>
  [id, "Poncho: The Original", "Poncho", "12434k", "Moss", size, url, "", "W – Woven Shirt", "Mens", "SS27", "99.95", "", "Rack B", "Competitor", "", "09/02/26"].join("|");
const hashFor = (labels, extra = "") => "#" + extra + "l=" + encodeURIComponent(labels.join("~"));

const launchOpts = { headless: true };
if (process.env.PW_CHROMIUM) launchOpts.executablePath = process.env.PW_CHROMIUM;
else if (existsSync("/opt/pw-browsers/chromium")) launchOpts.executablePath = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(launchOpts);

async function openPage(hash = "", { key, api } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/cdnjs\.cloudflare\.com\/.*qrcode/, r => r.fulfill({ contentType: "application/javascript", body: QR_LIB }));
  if (api) await page.route(/api\.airtable\.com/, api);
  await page.addInitScript(k => {
    window.__prints = [];
    window.print = () => window.__prints.push(document.querySelectorAll("#sheet .label").length);
    if (k) localStorage.setItem("ssco-airtable-pat", k);
  }, key || "");
  await page.goto(PAGE + hash);
  await page.waitForTimeout(400);
  return { page, ctx, errors };
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

await test("one label from a link renders with a QR and prints automatically", async () => {
  const { page, ctx, errors } = await openPage(hashFor([label("COMP1018", "M")]));
  await page.waitForFunction(() => window.__prints.length > 0, null, { timeout: 5000 });
  assert.deepEqual(await page.evaluate(() => window.__prints), [1]);
  assert.match(await page.textContent("#sheet"), /COMP1018/);
  assert.ok(await page.$("#sheet .code canvas, #sheet .code img"), "QR code drawn");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("#auto=0 stops the automatic print", async () => {
  const { page, ctx } = await openPage(hashFor([label("COMP1018", "M")], "auto=0&"));
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.__prints.length), 0);
  await ctx.close();
});

await test("several labels: no auto-print, clicking skips one, Print sends only the picked ones", async () => {
  const { page, ctx } = await openPage(hashFor([label("COMP1", "S"), label("COMP2", "M"), label("COMP3", "L")]));
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => window.__prints.length), 0);
  assert.equal(await page.locator("#sheet .label").count(), 3);
  assert.match(await page.textContent("#count"), /3 of 3 selected/);
  await page.locator("#sheet .label").nth(1).click();
  assert.match(await page.textContent("#count"), /2 of 3 selected/);
  await page.click("#print");
  assert.deepEqual(await page.evaluate(() => window.__prints), [2]);
  await ctx.close();
});

await test("factory preset (#p=factory) prints with no QR code", async () => {
  const { page, ctx } = await openPage(hashFor([label("COMP1018", "M")], "p=factory&auto=0&"));
  assert.equal(await page.locator("#sheet .code").count(), 0);
  assert.match(await page.textContent("#sheet"), /COMP1018/);
  await ctx.close();
});

await test("no key and no link: shows the example label and asks for a key", async () => {
  const { page, ctx } = await openPage("");
  assert.match(await page.textContent("#qmsg"), /Airtable key/);
  assert.ok(await page.isDisabled("#print"));
  await ctx.close();
});

await test("queue mode: loads queued records with the key, prints, then clears them", async () => {
  const calls = [];
  let queued = [
    { id: "recA", fields: { [LABEL_FIELD]: label("COMP1036", "M") } },
    { id: "recB", fields: { [LABEL_FIELD]: label("COMP1037", "L") } },
  ];
  const api = async route => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), auth: req.headers()["authorization"], body: req.postData() });
    if (req.method() === "PATCH") {
      const ids = JSON.parse(req.postData()).records.map(r => r.id);
      queued = queued.filter(r => !ids.includes(r.id));
      return route.fulfill({ json: { records: [] } });
    }
    return route.fulfill({ json: { records: queued } });
  };
  const { page, ctx } = await openPage("", { key: "patTEST.123", api });
  await page.waitForFunction(() => document.querySelectorAll("#sheet .label.pickable").length === 2, null, { timeout: 5000 });
  const get = calls.find(c => c.method === "GET");
  assert.equal(get.auth, "Bearer patTEST.123");
  const u = new URL(get.url);
  assert.equal(u.pathname, "/v0/appKtpXk0YgWdp8Ac/tblwyHmt86GNwAU1m");
  assert.equal(u.searchParams.get("filterByFormula"), "{Print Queue}");
  assert.equal(u.searchParams.get("returnFieldsByFieldId"), "true");
  await page.click("#print");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  assert.ok(await page.isVisible("#qclear"), "clear button shown after printing");
  await page.click("#qclear");
  await page.waitForFunction(() => /empty/.test(document.querySelector("#qmsg").textContent), null, { timeout: 5000 });
  const patch = calls.find(c => c.method === "PATCH");
  assert.deepEqual(JSON.parse(patch.body), { records: [
    { id: "recA", fields: { [QUEUE_FIELD]: false } },
    { id: "recB", fields: { [QUEUE_FIELD]: false } },
  ] });
  await ctx.close();
});

await test("a rejected key shows the key bar again", async () => {
  const { page, ctx } = await openPage("", { key: "patBAD", api: r => r.fulfill({ status: 401, json: {} }) });
  await page.waitForFunction(() => /didn't accept/.test(document.querySelector("#qmsg").textContent), null, { timeout: 5000 });
  assert.ok(await page.isVisible("#keybar"));
  await ctx.close();
});

await test("Save template stores the layout in this browser", async () => {
  const { page, ctx } = await openPage(hashFor([label("COMP1", "S")], "auto=0&"));
  await page.click("#saveOpen");
  await page.fill("#tplName", "Smoke test");
  await page.click("#save");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ssco-label-templates") || "[]"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "Smoke test");
  assert.ok(await page.$$eval("#tpl option", os => os.some(o => o.textContent === "Smoke test")));
  await ctx.close();
});

await browser.close();
for (const [s, n, m] of results) console.log(`${s}  ${n}${m ? "\n      " + m : ""}`);
const failed = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
