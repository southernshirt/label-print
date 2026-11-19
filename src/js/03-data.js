// ---------- data ----------
// Labels come from the Airtable print queue (records with Print Queue ticked),
// read through the viewer's own Airtable connection.
const AT = {server:"Airtable", base:"appKtpXk0YgWdp8Ac", table:"tblwyHmt86GNwAU1m",
            labelData:"fld8vSlUXNO9AyYkI", queue:"fldt3i65krI4cHgIM"};
let queue = [];          // [{rec, label}]
let printedIds = [];     // record ids included in the last print
let picked = new Set();  // record ids the user has selected to print
let printing = false;    // true while building the PDF: render only picked labels
let mcp = null;
let knownRecs = new Set();
const parseLabel = t => { const p = String(t||"").split("|"), o = {}; KEYS.forEach((k,i) => o[k] = (p[i]||"").trim()); return o; };
function readLabels(){
  if(queue.length) return (printing ? queue.filter(q => picked.has(q.rec)) : queue).map(q => q.label);
  const hp = new URLSearchParams(location.hash.slice(1));
  const raw = hp.get("l") || new URLSearchParams(location.search).get("l") || "";
  return raw.split("~").filter(Boolean).map(parseLabel).filter(x => x.id);
}
function qmsg(text, showClear){ $("qmsg").textContent = text; $("qclear").classList.toggle("is-hidden", !showClear); }
function mcpErrorText(e){
  switch(e && e.code){
    case "server_not_connected": case "selection_required":
      return "Connect Airtable to Claude (claude.ai → Settings → Connectors → Airtable), then press Refresh queue.";
    case "needs_reauth": return "Your Airtable connection expired. Reconnect Airtable in claude.ai → Settings → Connectors, then press Refresh queue.";
    case "not_in_manifest": return "Airtable access is turned off for this page. Allow Airtable for this page, then press Refresh queue.";
    case "blocked_by_policy": case "approval_required": return "Your organization's settings block Airtable here. Ask your Claude admin.";
    case "server_unavailable": return "Airtable didn't answer. Press Refresh queue in a moment.";
    case "tool_error": return "Airtable refused the request: " + (e.message || "unknown error");
    default: return "Couldn't read the print queue (" + ((e && e.code) || "error") + "). Press Refresh queue to try again.";
  }
}
async function loadQueue(){
  if(!mcp){ qmsg("Printing from Airtable needs this page opened in Claude while signed in."); return; }
  qmsg("Checking the Airtable print queue…");
  try{
    const res = await mcp.callTool(AT.server, "list_records_for_table", {
      baseId: AT.base, tableId: AT.table, fieldIds: [AT.labelData, AT.queue], pageSize: 500,
      filters: {operator:"and", operands:[{operator:"=", operands:[AT.queue, true]}]}
    }, {cache:false});
    const recs = (res && res.payload && res.payload.records) || [];
    queue = recs.map(r => ({rec: r.id, label: parseLabel((r.cellValuesByFieldId||{})[AT.labelData])})).filter(q => q.label.id);
    queue.sort((a,b) => a.label.id.localeCompare(b.label.id, undefined, {numeric:true}));
    const prev = picked; picked = new Set(queue.map(q => q.rec).filter(r => !knownRecs.has(r) || prev.has(r)));
    knownRecs = new Set(queue.map(q => q.rec));
    qmsg(queue.length ? `${queue.length} label${queue.length>1?"s":""} in the print queue. Click a label to select or unselect it.`
                      : "The print queue is empty. Tick Print Queue on a sample in Airtable (or press 🖨 Print label on its page), then press Refresh queue.", false);
  }catch(e){ queue = []; qmsg(mcpErrorText(e)); }
  render();
}
async function clearQueue(){
  if(!mcp || !printedIds.length) return;
  $("qclear").disabled = true;
  try{
    for(let i = 0; i < printedIds.length; i += 50){
      await mcp.callTool(AT.server, "update_records_for_table", {
        baseId: AT.base, tableId: AT.table,
        records: printedIds.slice(i, i+50).map(id => ({id, fields: {[AT.queue]: false}}))
      });
    }
    printedIds = [];
    await loadQueue();
  }catch(e){ qmsg(mcpErrorText(e) + " The queue was not cleared.", true); }
  finally{ $("qclear").disabled = false; }
}
const SAMPLE = [{id:"COMP1000",name:"Example Performance Polo",brand:"Brand Name",style:"ST-1234",color:"Navy",size:"M",url:"https://airtable.com/example",sku:"123456-NVY",category:"K – Polo",gender:"Mens",season:"SS27",msrp:"68",composition:"92% Polyester / 8% Spandex",location:"Rack A",sampleType:"Competitor",features:"Moisture-wicking, UPF 50, anti-odor",date:"09/12/26"}];
function val(L,k){ const v = L[k]; if(!v) return ""; if(k==="msrp"){ const n = Number(v); return isNaN(n) ? v : "$" + (n % 1 ? n.toFixed(2) : n); } return v; }

