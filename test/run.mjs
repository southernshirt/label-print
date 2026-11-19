// Dependency-free checks. Run: node test/run.mjs   (or: npm test)
//  1. index.html is exactly what src/ builds
//  2. the page's inline script parses
//  3. the Cloudflare Worker behaves correctly against a fake Airtable
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Script } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const ok = (name) => { passed++; console.log("  ok  " + name); };

// 1. build is up to date
execFileSync(process.execPath, [join(root, "build.mjs"), "--check"], { stdio: "pipe" });
ok("index.html matches src/ (node build.mjs --check)");

// 2. page script parses (compiled, not run)
const html = readFileSync(join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 1, "expected one inline <script>");
new Script(scripts[0], { filename: "index.html <script>" });
ok("inline script parses");
assert.ok(!/\bpat[A-Za-z0-9]{14}\.[0-9a-f]{20,}/.test(html), "an Airtable token is in index.html");
ok("no Airtable token in index.html");

// 3. Worker against a fake Airtable
const { default: worker } = await import(join(root, "worker", "index.js"));
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || "GET", auth: opts.headers?.Authorization, body: opts.body });
  if ((opts.method || "GET") === "GET") {
    const page2 = String(url).includes("offset=p2");
    return Response.json(page2
      ? { records: [{ id: "recBBBBBBBBBBBBBB", fields: { fld8vSlUXNO9AyYkI: "COMP1002|Tee" } }] }
      : { records: [{ id: "recAAAAAAAAAAAAAA", fields: { fld8vSlUXNO9AyYkI: "COMP1001|Polo" } }], offset: "p2" });
  }
  return Response.json({ records: [] });
};
const env = { AIRTABLE_TOKEN: "TEST_TOKEN", ALLOWED_ORIGINS: "https://southernshirt.github.io", TEAM_CODE: "abc" };
const SITE = { Origin: "https://southernshirt.github.io" };
const call = async (method, path, headers = {}, body, e = env) => {
  const r = await worker.fetch(new Request("https://proxy.test" + path, { method, headers, body }), e);
  return { status: r.status, json: r.status === 204 ? null : await r.json(), headers: r.headers };
};

let r = await call("GET", "/queue", { ...SITE, "X-Team-Code": "abc" });
assert.equal(r.status, 200);
assert.deepEqual(r.json.records.map(x => x.id), ["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"]);
assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE.Origin);
assert.ok(calls.every(c => c.auth === "Bearer TEST_TOKEN"));
ok("GET /queue returns every page of the queue and uses the secret token");

r = await call("GET", "/queue", { ...SITE, "X-Team-Code": "wrong" });
assert.equal(r.status, 401); ok("wrong passcode -> 401");
r = await call("GET", "/queue", { ...SITE }, undefined, { ...env, TEAM_CODE: undefined });
assert.equal(r.status, 200); ok("no TEAM_CODE set -> no passcode needed");
r = await call("GET", "/queue", { Origin: "https://example.com", "X-Team-Code": "abc" });
assert.equal(r.status, 403); ok("other website -> 403");
r = await call("OPTIONS", "/queue", SITE);
assert.equal(r.status, 204); ok("CORS preflight from the site -> 204");

calls.length = 0;
const ids = Array.from({ length: 23 }, (_, i) => "rec" + String(i).padStart(14, "A"));
r = await call("POST", "/clear", { ...SITE, "X-Team-Code": "abc", "Content-Type": "application/json" }, JSON.stringify({ ids }));
assert.equal(r.status, 200); assert.equal(r.json.cleared, 23);
assert.equal(calls.length, 3, "23 ids should be 3 PATCH calls of max 10");
assert.deepEqual(JSON.parse(calls[0].body).records[0], { id: ids[0], fields: { fldt3i65krI4cHgIM: false } });
ok("POST /clear unticks Print Queue in batches of 10");
r = await call("POST", "/clear", { ...SITE, "X-Team-Code": "abc" }, JSON.stringify({ ids: ["L0"] }));
assert.equal(r.status, 400); ok("POST /clear rejects ids that aren't Airtable record ids");
r = await call("GET", "/queue", { ...SITE, "X-Team-Code": "abc" }, undefined, { ...env, AIRTABLE_TOKEN: "" });
assert.equal(r.status, 500); ok("missing AIRTABLE_TOKEN -> 500 with a clear error");
r = await call("GET", "/nope", { ...SITE, "X-Team-Code": "abc" });
assert.equal(r.status, 404); ok("unknown path -> 404");

console.log(`\n${passed} checks passed`);
