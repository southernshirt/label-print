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
// ---------- labels: from the link, or from the Airtable queue with the viewer's own key ----------
const KEY = "ssco-airtable-pat";
const getKey = () => { try{ return localStorage.getItem(KEY) || ""; }catch(e){ return ""; } };
let fromApi = false;
const API = `https://api.airtable.com/v0/${AT.base}/${AT.table}`;
function showKeybar(on){ $("keybar").classList.toggle("is-hidden", !on); if(on) $("keyin").focus(); }
$("qkey").addEventListener("click", () => showKeybar($("keybar").classList.contains("is-hidden")));
$("keypaste").addEventListener("click", async () => {
  try{ const t = (await navigator.clipboard.readText()).trim(); if(t){ $("keyin").value = t; qmsg(t.startsWith("pat") ? "Key pasted. Press Save." : "Pasted, but it doesn't start with \"pat\". Copy the token again from Airtable."); } else qmsg("The clipboard is empty. Copy the token in Airtable first."); }
  catch(e){ qmsg("Chrome blocked reading the clipboard. Click the box and press Cmd+V (or right-click, Paste)."); $("keyin").focus(); }
});
$("keyin").addEventListener("keydown", e => { if(e.key === "Enter") $("keysave").click(); });
$("keysave").addEventListener("click", () => { const v = $("keyin").value.trim(); if(!v) return; try{ localStorage.setItem(KEY, v); }catch(e){} $("keyin").value = ""; showKeybar(false); loadQueue(); });
$("keyforget").addEventListener("click", () => { try{ localStorage.removeItem(KEY); }catch(e){} showKeybar(false); queue = []; picked.clear(); qmsg("Key removed from this browser."); render(); });

function setQueue(items){
  const prev = picked; queue = items;
  picked = new Set(items.map(q => q.rec).filter(r => !knownRecs.has(r) || prev.has(r)));
  knownRecs = new Set(items.map(q => q.rec));
}
loadQueue = async function(){
  const key = getKey();
  if(!key){ qmsg("To print the queue, add your Airtable key (button on the right). To print one label, use 🖨 Print label on a sample."); render(); return; }
  qmsg("Checking the Airtable print queue…");
  try{
    let out = [], offset = "";
    do{
      const u = new URL(API);
      u.searchParams.set("filterByFormula", "{Print Queue}");
      u.searchParams.append("fields[]", AT.labelData);
      u.searchParams.set("returnFieldsByFieldId", "true");
      u.searchParams.set("pageSize", "100");
      if(offset) u.searchParams.set("offset", offset);
      const r = await fetch(u, {headers:{Authorization:"Bearer " + key}});
      if(r.status === 401 || r.status === 403) throw new Error("key");
      if(!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(); out = out.concat(j.records || []); offset = j.offset || "";
    }while(offset);
    const items = out.map(r => ({rec:r.id, label:parseLabel((r.fields||{})[AT.labelData])})).filter(q => q.label.id)
      .sort((a,b) => a.label.id.localeCompare(b.label.id, undefined, {numeric:true}));
    fromApi = true; setQueue(items);
    qmsg(items.length ? `${items.length} label${items.length>1?"s":""} in the print queue. Click a label to select or skip it.` : "The print queue is empty. Press Add to print queue on a sample, then Refresh queue.");
  }catch(e){
    qmsg(e.message === "key" ? "Airtable didn't accept that key. Check it has read and write access to Lemonade Stand Inventory, then add it again." : "Couldn't reach Airtable (" + e.message + "). Press Refresh queue to try again.");
    if(e.message === "key") showKeybar(true);
  }
  render();
};
clearQueue = async function(){
  const key = getKey(); if(!key || !printedIds.length) return;
  $("qclear").disabled = true;
  try{
    for(let i = 0; i < printedIds.length; i += 10){
      const r = await fetch(API, {method:"PATCH", headers:{Authorization:"Bearer " + key, "Content-Type":"application/json"},
        body: JSON.stringify({records: printedIds.slice(i, i+10).map(id => ({id, fields:{[AT.queue]: false}}))})});
      if(!r.ok) throw new Error("HTTP " + r.status);
    }
    printedIds = []; await loadQueue();
  }catch(e){ qmsg("Couldn't clear the queue (" + e.message + "). Your key needs write access.", true); }
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
