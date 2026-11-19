const ROLLS = [
  {k:"DK-1209", n:'DK-1209 Small address, 1.1" × 2.4"', w:29, h:62},
  {k:"DK-1201", n:'DK-1201 Standard address, 1.1" × 3.5"', w:29, h:90.3},
  {k:"DK-1208", n:'DK-1208 Large address, 1.4" × 3.5"', w:38, h:90.3},
  {k:"DK-1202", n:'DK-1202 Shipping, 2.4" × 3.9"', w:62, h:100},
  {k:"DK-1204", n:'DK-1204 Multi-purpose, 0.66" × 2.1"', w:17, h:54},
  {k:"DK-1203", n:'DK-1203 File folder, 0.66" × 3.4"', w:17, h:87},
  {k:"DK-3235", n:'DK-3235 Removable, 1.1" × 2.1"', w:29, h:54},
  {k:"DK-1221", n:'DK-1221 Square, 0.9" × 0.9"', w:23, h:23},
  {k:"DK-1218", n:'DK-1218 Round, 1" diameter', w:24, h:24, round:true},
  {k:"DK-1219", n:'DK-1219 Round, 1/2" diameter', w:12, h:12, round:true},
  {k:"DK-2205", n:'DK-2205 Continuous paper, 2.4" wide', w:62, cont:true},
  {k:"DK-2251", n:'DK-2251 Continuous black/red, 2.4" wide', w:62, cont:true},
  {k:"DK-2113", n:'DK-2113 Continuous clear film, 2.4" wide', w:62, cont:true},
  {k:"DK-N5224", n:'DK-N5224 Continuous non-adhesive, 2.1" wide', w:54, cont:true},
  {k:"DK-2223", n:'DK-2223 Continuous paper, 2" wide', w:50, cont:true},
  {k:"DK-2210", n:'DK-2210 Continuous paper, 1.1" wide', w:29, cont:true}
];
// Uline badge holder usable sizes (W x H inches) and their paper inserts.
const BADGES = [
  {k:"U-3x2", n:'3" × 2" horizontal (insert S-14784)', w:3, h:2},
  {k:"U-2x3", n:'2" × 3" vertical (insert S-14784)', w:2, h:3},
  {k:"U-4x3", n:'4" × 3" horizontal (insert S-10446)', w:4, h:3},
  {k:"U-3x4", n:'3" × 4" vertical (insert S-10446)', w:3, h:4},
  {k:"U-4x6", n:'4" × 6" vertical (insert S-6745)', w:4, h:6}
];
const KEYS = ["id","name","brand","style","color","size","url","sku","category","gender","season","msrp","composition","location","sampleType","features","date"];
const GROUPS = [
  {g:"Identity", f:[["id","Sample ID","ID"],["name","Item name","Name"],["brand","Brand","Brand"],["style","Brand style #","Style"],["sku","Brand SKU / Product ID","SKU"]]},
  {g:"Tracking", f:[["season","Dev Season","Dev"],["date","Date (purchase date)","Date"]]},
  {g:"Size & color", f:[["size","Size","Size"],["color","Color","Color"]]},
  {g:"Classification", f:[["category","Category","Cat."],["gender","Gender","Gender"],["sampleType","Sample type","Type"]]},
  {g:"Price", f:[["msrp","MSRP","MSRP"]]},
  {g:"Materials & features", f:[["composition","Composition","Comp."],["features","Features","Features"]]},
  {g:"Storage", f:[["location","Location","Loc."]]}
];
const COLORS = [["#000000","Black"],["#c8102e","Red"],["#555555","Dark gray"],["#1f5a47","Green"],["#1d4e89","Blue"]];
const MM = 96/25.4;
const $ = id => document.getElementById(id);
const esc = s => String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const F = (on,size,extra) => Object.assign({on,size,bold:false,italic:false,color:"#000000",label:false}, extra||{});

function baseFields(){
  const f = {}; GROUPS.forEach(G => G.f.forEach(([k]) => f[k] = F(false,7))); return f;
}
function defaults(){
  const fields = baseFields();
  Object.assign(fields.name, {on:true,size:9,bold:true}); fields.brand.on = true;
  Object.assign(fields.size, {on:true,size:8,bold:true,label:true}); fields.color.on = true;
  return {media:"brother", roll:"DK-1209", lenMode:"auto", lenIn:2.5, orient:"land", badge:"U-3x4", badgeMode:"tile",
          font:"Helvetica, Arial, sans-serif", align:"left", scale:100, autoFit:true, nameMode:"top", qr:{on:true,pos:"qr-left",size:55,showId:true}, fields};
}

// Layout presets: a starting point the user can keep editing.
const PRESETS = [
  {n:"Factory sample (no QR)", d:"For samples sent to manufacturers: ID, name, style #, size, color, season", set:s => { s.nameMode="top"; s.qr.on = false; s.align="left"; only(s,{name:[9,1],id:[8,1,1],style:[7,0,1],size:[7,1,1],color:[7,0,1],season:[7,0,1]}); }},
  {n:"Hangtag", d:"Name across top, QR, dev season, date, size", set:s => { s.nameMode="top"; s.qr = {on:true,pos:"qr-left",size:80,showId:true}; s.align="left"; only(s,{name:[9,1],season:[7.5,1,1],date:[7,0,1],size:[7,0,1]}); }},
  {n:"Detail tag", d:"QR left, full product info", set:s => { s.nameMode="top"; s.qr = {on:true,pos:"qr-left",size:70,showId:true}; s.align="left"; only(s,{name:[8,1],season:[6.5,1,1],date:[6.5,0,1],brand:[6.5],style:[6.5,0,1],size:[6.5,0,1],color:[6.5,0,1],msrp:[6.5,0,1]}); }},
  {n:"Badge, vertical", d:"QR on top, large name", set:s => { s.nameMode="inline"; s.qr = {on:true,pos:"qr-top",size:60,showId:true}; s.align="center"; only(s,{name:[18,1],season:[12,1,1],date:[10,0,1],brand:[11],size:[11,0,1]}); }},
  {n:"Badge, horizontal", d:"Name across top, QR, details", set:s => { s.nameMode="top"; s.qr = {on:true,pos:"qr-left",size:80,showId:true}; s.align="left"; only(s,{name:[16,1],season:[11,1,1],date:[10,0,1],brand:[10],style:[9,0,1],size:[9,0,1]}); }},
  {n:"Details only", d:"No QR, text fills the label", set:s => { s.nameMode="inline"; s.qr.on = false; s.align="left"; only(s,{name:[10,1],season:[8,1,1],date:[7,0,1],size:[7,0,1]}); }},
  {n:"QR only", d:"Big QR with Sample ID", set:s => { s.nameMode="inline"; s.qr = {on:true,pos:"qr-top",size:100,showId:true}; s.align="center"; only(s,{}); }}
];
function only(s,map){ // map key -> [size, bold, showLabel]
  Object.keys(s.fields).forEach(k => s.fields[k].on = false);
  Object.entries(map).forEach(([k,[size,b,l]]) => Object.assign(s.fields[k], {on:true,size,bold:!!b,label:!!l,italic:false}));
}

let S = defaults(), templates = [], db = null, zoom = 1.5;

