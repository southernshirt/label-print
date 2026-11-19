// ---------- wire up ----------
$("m-brother").addEventListener("click", () => { S.media = "brother"; changed(); });
$("m-badge").addEventListener("click", () => { S.media = "badge"; changed(); });
$("roll").addEventListener("change", e => { S.roll = e.target.value; changed(); });
$("badge").addEventListener("change", e => { S.badge = e.target.value; changed(); });
$("b-tile").addEventListener("click", () => { S.badgeMode = "tile"; changed(); });
$("b-single").addEventListener("click", () => { S.badgeMode = "single"; changed(); });
$("len").addEventListener("input", e => { S.lenIn = Number(e.target.value)||2.5; changed(); });
$("len-auto").addEventListener("click", () => { S.lenMode = "auto"; changed(); });
$("len-fixed").addEventListener("click", () => { S.lenMode = "fixed"; changed(); });
$("o-land").addEventListener("click", () => { S.orient = "land"; changed(); });
$("o-port").addEventListener("click", () => { S.orient = "port"; changed(); });
$("font").addEventListener("change", e => { S.font = e.target.value; changed(); });
$("align").addEventListener("change", e => { S.align = e.target.value; changed(); });
$("scale").addEventListener("input", e => { S.scale = Number(e.target.value); changed(); });
$("autofit").addEventListener("change", e => { S.autoFit = e.target.checked; changed(); });
$("nameMode").addEventListener("change", e => { S.nameMode = e.target.value; changed(); });
$("qr-on").addEventListener("change", e => { S.qr.on = e.target.checked; changed(); });
$("qr-pos").addEventListener("change", e => { S.qr.pos = e.target.value; changed(); });
$("qr-size").addEventListener("input", e => { S.qr.size = Number(e.target.value); changed(); });
$("qr-id").addEventListener("change", e => { S.qr.showId = e.target.checked; changed(); });
function doPrint(){
  printedIds = queue.filter(q => picked.has(q.rec)).map(q => q.rec);
  printing = true; render();
  window.print();
}
window.addEventListener("afterprint", () => {
  if(!printing) return; printing = false; render();
  if(fromApi && printedIds.length) qmsg(`Printed ${printedIds.length} label${printedIds.length>1?"s":""}. Clear them from the queue when they came out right.`, true);
});
$("print").addEventListener("click", doPrint);
$("qall").addEventListener("click", () => { queue.forEach(q => picked.add(q.rec)); render(); });
$("qnone").addEventListener("click", () => { picked.clear(); render(); });
$("qrefresh").addEventListener("click", loadQueue);
$("qclear").addEventListener("click", clearQueue);
$("saveOpen").addEventListener("click", () => { $("saveBar").classList.toggle("is-hidden"); $("tplName").focus(); });

// ---------- shared templates ----------
function load(settings){
  const d = defaults(), s = settings || {};
  S = Object.assign(d, s, {qr:Object.assign(d.qr, s.qr||{}), fields:d.fields});
  Object.keys(S.fields).forEach(key => S.fields[key].on = false);
  if(s.fields) Object.keys(d.fields).forEach(key => { if(s.fields[key] && typeof s.fields[key] === "object") Object.assign(S.fields[key], s.fields[key]); });
}
function fillTemplates(){
  const cur = $("tpl").value;
  $("tpl").innerHTML = '<option value="">Custom (not saved)</option>';
  templates.forEach(t => $("tpl").add(new Option(t.name, t.id)));
  if(templates.some(t=>t.id===cur)) $("tpl").value = cur;
}
$("tpl").addEventListener("change", () => {
  const t = templates.find(x=>x.id===$("tpl").value);
  if(t){ load(t.settings); syncControls(); render(); $("tplName").value = t.name; $("tpl").value = t.id; $("del").classList.toggle("is-hidden", !db); }
  else $("del").classList.add("is-hidden");
});
$("save").addEventListener("click", async () => {
  const name = $("tplName").value.trim();
  if(!name){ $("saveMsg").textContent = "Enter a template name first."; return; }
  if(!db){ $("saveMsg").textContent = "Saving needs you to be signed in to Claude."; return; }
  $("save").disabled = true;
  try{
    const existing = templates.find(t => t.name.toLowerCase() === name.toLowerCase());
    const ref = existing ? db.collection("templates").doc(existing.id) : db.collection("templates").doc();
    await ref.set({name, settings:JSON.parse(JSON.stringify(Object.assign({}, S, {_fitK:undefined}))), updatedAt:new Date().toISOString()});
    $("saveMsg").textContent = existing ? `Updated "${name}".` : `Saved "${name}" on this computer.`;
    $("tpl").value = ref.id; $("del").classList.remove("is-hidden");
  }catch(e){
    $("saveMsg").textContent = e && e.code === "invalid_argument" ? "You have view-only access, so you can use templates but not save them." : "Couldn't save. Try again in a moment.";
  }finally{ $("save").disabled = false; }
});
$("del").addEventListener("click", async () => {
  const t = templates.find(x=>x.id===$("tpl").value);
  if(!t || !db) return;
  if($("del").dataset.armed !== t.id){ $("del").dataset.armed = t.id; $("del").textContent = "Click again to delete"; setTimeout(() => { $("del").dataset.armed = ""; $("del").textContent = "Delete template"; }, 4000); return; }
  $("del").dataset.armed = ""; $("del").textContent = "Delete template";
  try{ await db.collection("templates").doc(t.id).delete(); $("tpl").value=""; $("del").classList.add("is-hidden"); $("saveMsg").textContent = `Deleted "${t.name}".`; }
  catch(e){ $("saveMsg").textContent = "Couldn't delete this template."; }
});

syncControls(); render();
if(document.fonts) document.fonts.ready.then(render);

