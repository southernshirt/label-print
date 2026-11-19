// ---------- labels: from the link, or from the Airtable queue via the SSCO label proxy ----------
// The Airtable token lives in the Cloudflare Worker. It is never in this page or anyone's browser.
const PROXY = "https://ssco-label-proxy.YOUR-SUBDOMAIN.workers.dev";   // <-- set to the Worker URL
const CODE = "ssco-label-team-code";
try{ localStorage.removeItem("ssco-airtable-pat"); }catch(e){}   // remove keys saved by the old version
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
