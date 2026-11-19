// SSCO label-print proxy (Cloudflare Worker)
const BASE = "appKtpXk0YgWdp8Ac";
const TABLE = "tblwyHmt86GNwAU1m";
const LABEL_FIELD = "fld8vSlUXNO9AyYkI";
const QUEUE_FIELD = "fldt3i65krI4cHgIM";
const API = `https://api.airtable.com/v0/${BASE}/${TABLE}`;
const REC_ID = /^rec[A-Za-z0-9]{14}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Team-Code",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (!ok) return json({ error: "origin not allowed" }, 403);
    if (env.TEAM_CODE && request.headers.get("X-Team-Code") !== env.TEAM_CODE) return json({ error: "code" }, 401);
    if (!env.AIRTABLE_TOKEN) return json({ error: "AIRTABLE_TOKEN secret is missing" }, 500);

    const auth = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` };
    const path = new URL(request.url).pathname;

    if (request.method === "GET" && path === "/queue") {
      let records = [], offset = "";
      do {
        const u = new URL(API);
        u.searchParams.set("filterByFormula", "{Print Queue}");
        u.searchParams.append("fields[]", LABEL_FIELD);
        u.searchParams.set("returnFieldsByFieldId", "true");
        u.searchParams.set("pageSize", "100");
        if (offset) u.searchParams.set("offset", offset);
        const r = await fetch(u, { headers: auth });
        if (!r.ok) return json({ error: "airtable", status: r.status }, 502);
        const j = await r.json();
        records = records.concat((j.records || []).map(x => ({ id: x.id, label: (x.fields || {})[LABEL_FIELD] || "" })));
        offset = j.offset || "";
      } while (offset);
      return json({ records });
    }

    if (request.method === "POST" && path === "/clear") {
      let ids;
      try { ids = (await request.json()).ids; } catch { return json({ error: "bad body" }, 400); }
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => REC_ID.test(id)))
        return json({ error: "bad ids" }, 400);
      for (let i = 0; i < ids.length; i += 10) {
        const r = await fetch(API, {
          method: "PATCH",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ records: ids.slice(i, i + 10).map(id => ({ id, fields: { [QUEUE_FIELD]: false } })) }),
        });
        if (!r.ok) return json({ error: "airtable", status: r.status }, 502);
      }
      return json({ cleared: ids.length });
    }

    return json({ error: "not found" }, 404);
  },
};
