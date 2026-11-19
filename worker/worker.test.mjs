// Unit tests for the label-print proxy Worker (worker.js), run in plain Node 18+.
// Airtable is mocked by replacing globalThis.fetch; no network, no Cloudflare account.
// Run: node worker/worker.test.mjs
import assert from "node:assert/strict";
import worker from "./worker.js";

const ORIGIN = "https://southernshirt.github.io";
const env = { AIRTABLE_TOKEN: "patFAKE", ALLOWED_ORIGINS: ORIGIN };
const LABEL = "fld8vSlUXNO9AyYkI", QUEUE = "fldt3i65krI4cHgIM";

let airtableCalls = [];
function mockAirtable(pages) {
  airtableCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    airtableCalls.push({ url: String(url), init });
    if ((init.method || "GET") === "PATCH") return new Response(JSON.stringify({ records: [] }), { status: 200 });
    const offset = new URL(url).searchParams.get("offset") || "";
    const page = pages[offset];
    return new Response(JSON.stringify(page), { status: 200 });
  };
}
const req = (path, { method = "GET", origin = ORIGIN, headers = {}, body } = {}) =>
  new Request("https://proxy.example" + path, { method, headers: { Origin: origin, ...headers }, body });

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message]); }
}

await test("GET /queue pages through Airtable and returns {id,label}", async () => {
  mockAirtable({
    "": { records: [{ id: "recAAAAAAAAAAAAAA", fields: { [LABEL]: "COMP1|a" } }], offset: "p2" },
    p2: { records: [{ id: "recBBBBBBBBBBBBBB", fields: {} }] },
  });
  const r = await worker.fetch(req("/queue"), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual(await r.json(), { records: [{ id: "recAAAAAAAAAAAAAA", label: "COMP1|a" }, { id: "recBBBBBBBBBBBBBB", label: "" }] });
  assert.equal(airtableCalls.length, 2);
  assert.equal(airtableCalls[0].init.headers.Authorization, "Bearer patFAKE");
  assert.equal(new URL(airtableCalls[0].url).searchParams.get("filterByFormula"), "{Print Queue}");
});

await test("other origins get 403 and no Airtable call", async () => {
  mockAirtable({});
  const r = await worker.fetch(req("/queue", { origin: "https://example.com" }), env);
  assert.equal(r.status, 403);
  assert.equal(airtableCalls.length, 0);
});

await test("OPTIONS preflight: 204 for the allowed origin, 403 otherwise", async () => {
  assert.equal((await worker.fetch(req("/queue", { method: "OPTIONS" }), env)).status, 204);
  assert.equal((await worker.fetch(req("/queue", { method: "OPTIONS", origin: "https://x.com" }), env)).status, 403);
});

await test("TEAM_CODE set: wrong or missing X-Team-Code gets 401, right one works", async () => {
  mockAirtable({ "": { records: [] } });
  const e2 = { ...env, TEAM_CODE: "lemon" };
  assert.equal((await worker.fetch(req("/queue"), e2)).status, 401);
  assert.equal((await worker.fetch(req("/queue", { headers: { "X-Team-Code": "nope" } }), e2)).status, 401);
  assert.equal((await worker.fetch(req("/queue", { headers: { "X-Team-Code": "lemon" } }), e2)).status, 200);
});

await test("POST /clear unticks Print Queue in batches of 10", async () => {
  mockAirtable({});
  const ids = Array.from({ length: 12 }, (_, i) => "rec" + String(i).padStart(14, "X"));
  const r = await worker.fetch(req("/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { cleared: 12 });
  assert.equal(airtableCalls.length, 2);
  const first = JSON.parse(airtableCalls[0].init.body);
  assert.equal(first.records.length, 10);
  assert.deepEqual(first.records[0], { id: ids[0], fields: { [QUEUE]: false } });
});

await test("POST /clear rejects bad ids", async () => {
  mockAirtable({});
  const r = await worker.fetch(req("/clear", { method: "POST", body: JSON.stringify({ ids: ["DROP TABLE"] }) }), env);
  assert.equal(r.status, 400);
  assert.equal(airtableCalls.length, 0);
});

await test("missing AIRTABLE_TOKEN secret gives a clear 500", async () => {
  const r = await worker.fetch(req("/queue"), { ALLOWED_ORIGINS: ORIGIN });
  assert.equal(r.status, 500);
});

await test("unknown path gives 404", async () => {
  assert.equal((await worker.fetch(req("/nope"), env)).status, 404);
});

for (const [s, n, m] of results) console.log(`${s}  ${n}${m ? "\n      " + m : ""}`);
const failed = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
