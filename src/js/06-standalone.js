// ---------- standalone: templates live in this browser; labels come from the link ----------
const LS = "ssco-label-templates";
const lsGet = () => { try{ return JSON.parse(localStorage.getItem(LS) || "[]"); }catch(e){ return []; } };
const lsSet = v => { try{ localStorage.setItem(LS, JSON.stringify(v)); return true; }catch(e){ return false; } };
db = {collection: () => ({
  orderBy: () => ({ onSnapshot: cb => { const emit = () => cb({docs: lsGet().sort((x,y)=>x.name.localeCompare(y.name)).map(t => ({id:t.id, data:() => t}))}); db._emit = emit; emit(); } }),
  doc: id => { id = id || ("t" + Date.now()); return { id,
    set: async v => { const all = lsGet().filter(t => t.id !== id); all.push(Object.assign({id}, v)); lsSet(all); db._emit && db._emit(); },
    delete: async () => { lsSet(lsGet().filter(t => t.id !== id)); db._emit && db._emit(); } }; }
})};
db.collection("templates").orderBy("name").onSnapshot(snap => { templates = snap.docs.map(d => ({id:d.id, ...d.data()})); fillTemplates(); }, () => {});

const HP = new URLSearchParams(location.hash.slice(1));
const want = (HP.get("p") || "").toLowerCase();       // preset: factory | hangtag | detail | qr ...
const tplName = HP.get("t");                            // saved template name in this browser
const tpl = tplName && templates.find(t => t.name.toLowerCase() === tplName.toLowerCase());
if(tpl){ load(tpl.settings); $("tpl").value = tpl.id; }
else if(want){ const pr = PRESETS.find(x => x.n.toLowerCase().startsWith(want)); if(pr) pr.set(S); }
else { const last = lsGet().find(t => t.id === (localStorage.getItem("ssco-last-tpl")||"")); if(last){ load(last.settings); $("tpl").value = last.id; } }
$("tpl").addEventListener("change", () => { try{ localStorage.setItem("ssco-last-tpl", $("tpl").value); }catch(e){} });
// ---------- labels: from the link, or from the Airtable queue via the SSCO label proxy ----------
// The Airtable token lives in the Cloudflare Worker (see worker.js). It is never in this page or anyone's browser.
const PROXY = "https://ssco-label-proxy.YOUR-SUBDOMAIN.workers.dev";   // <-- set to your Worker URL (Step 3)
const CODE = "ssco-label-team-code";
try{ localStorage.removeItem("ssco-airtable-pat"); }catch(e){}   // clean up keys people pasted in the old version
const getCode = () => { try{ return localStorage.getItem(CODE) || ""; }catch(e){ return ""; } };
const hdrs = extra => Object.assign({"X-Team-Code": getCode()}, extra || {});
let fromApi = false;
function showKeybar(on){ $("keybar").classList.toggle("is-hidden", !on); if(on) $("keyin").focus(); }
$("qkey").addEventListener("click", () => showKeybar($("keybar").classList.contains("is-hidden")));
$("keypaste").addEventListener("click", async () => {
  try{ const t = (await navigator.clipboard.readText()).trim(); if(t){ $("keyin").value = t; qmsg("Passcode pasted. Press Save."); } else qmsg("The clipboard is empty."); }
  catch(e){ qmsg("Chrome blocked reading the clipboard. Click the box and press Cmd+V (or right-click, Paste)."); $("keyin").focus(); }
});
$("keyin").addEventListener("keydown", e => { if(e.key === "Enter") $("keysave").click(); });
$("keysave").addEventListener("click", () => { const v = $("keyin").value.trim(); if(!v) return; try{ localStorage.setItem(CODE, v); }catch(e){} $("keyin").value = ""; showKeybar(false); loadQueue(); });
$("keyforget").addEventListener("click", () => { try{ localStorage.removeItem(CODE); }catch(e){} showKeybar(false); queue = []; picked.clear(); qmsg("Passcode removed from this browser."); render(); });

function setQueue(items){
  const prev = picked; queue = items;
  picked = new Set(items.map(q => q.rec).filter(r => !knownRecs.has(r) || prev.has(r)));
  knownRecs = new Set(items.map(q => q.rec));
}
loadQueue = async function(){
  if(PROXY.includes("YOUR-SUBDOMAIN")){ qmsg("The print queue isn't connected yet (the label proxy address isn't set). Single labels from a sample's 🖨 button still work."); render(); return; }
  qmsg("Checking the Airtable print queue…");
  try{
    const r = await fetch(PROXY + "/queue", {headers: hdrs()});
    if(r.status === 401) throw new Error("code");
    if(!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const items = (j.records || []).map(x => ({rec:x.id, label:parseLabel(x.label)})).filter(q => q.label.id)
      .sort((a,b) => a.label.id.localeCompare(b.label.id, undefined, {numeric:true}));
    fromApi = true; setQueue(items);
    qmsg(items.length ? `${items.length} label${items.length>1?"s":""} in the print queue. Click a label to select or skip it.` : "The print queue is empty. Press Add to print queue on a sample, then Refresh queue.");
  }catch(e){
    qmsg(e.message === "code" ? "Enter the team passcode (Team passcode button on the right) to load the print queue." : "Couldn't reach the print queue (" + e.message + "). Press Refresh queue to try again.");
    if(e.message === "code") showKeybar(true);
  }
  render();
};
clearQueue = async function(){
  const ids = printedIds.filter(id => /^rec[A-Za-z0-9]{14}$/.test(id));
  if(!ids.length) return;
  $("qclear").disabled = true;
  try{
    const r = await fetch(PROXY + "/clear", {method:"POST", headers: hdrs({"Content-Type":"application/json"}), body: JSON.stringify({ids})});
    if(!r.ok) throw new Error("HTTP " + r.status);
    printedIds = []; await loadQueue();
  }catch(e){ qmsg("Couldn't clear the queue (" + e.message + ").", true); }
  finally{ $("qclear").disabled = false; }
};
// rebind buttons to the standalone versions
$("qrefresh").replaceWith($("qrefresh").cloneNode(true)); $("qrefresh").addEventListener("click", () => loadQueue());
$("qclear").replaceWith($("qclear").cloneNode(true)); $("qclear").addEventListener("click", () => clearQueue());

syncControls();
const linkLabels = (() => { const raw = HP.get("l") || new URLSearchParams(location.search).get("l") || ""; return raw.split("~").filter(Boolean).map(parseLabel).filter(x => x.id); })();
window.addEventListener("hashchange", () => location.reload());
if(linkLabels.length){
  fromApi = false; setQueue(linkLabels.map((label,i) => ({rec:"L"+i, label})));
  qmsg(linkLabels.length > 1 ? `${linkLabels.length} labels. Click a label to skip it, then press Print.` : "Label ready.");
  $("qrefresh").classList.add("is-hidden");
  render();
  // One label from a sample's button: print straight away.
  if(linkLabels.length === 1 && HP.get("auto") !== "0")
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { render(); setTimeout(doPrint, 400); });
}else{
  render(); loadQueue();
}
