// ---------- render ----------
const pageStyle = document.createElement("style"); document.head.appendChild(pageStyle);

function geometry(){
  if(S.media === "badge"){ const b = BADGES.find(x => x.k === S.badge); return {w:b.w*25.4, h:b.h*25.4, auto:false, port:b.h>b.w, round:false, cont:false, name:b.n.split(" (")[0]}; }
  const r = ROLLS.find(x => x.k === S.roll);
  const auto = r.cont && S.lenMode === "auto";
  const len = r.cont ? Math.max(1, Math.min(39, Number(S.lenIn)||2.5))*25.4 : r.h;
  const square = r.round || r.w === r.h;
  const port = S.orient === "port" && !square;
  let w = port ? r.w : len, h = port ? len : r.w;
  if(square){ w = r.w; h = r.w; }
  return {w, h, auto, port, round:!!r.round, cont:!!r.cont, name:r.k};
}

// Draw every label at text scale k. With real=false the QR is a same-size placeholder (fast, for fitting).
function draw(G, labels, k, real, wrapTitle){
  const tiled = S.media === "badge" && S.badgeMode === "tile";
  const sheet = $("sheet"); sheet.style.zoom = 1; sheet.innerHTML = ""; sheet.className = tiled ? "pages" : "sheet";
  let per = 0, cols = 1, page = null;
  if(tiled){ cols = Math.max(1, Math.floor(7.5*25.4 / G.w)); per = cols * Math.max(1, Math.floor(10*25.4 / G.h)); }
  const holder = i => {
    if(!tiled) return sheet;
    if(i % per === 0){
      page = document.createElement("div"); page.className = "sheet tiled";
      page.style.gridTemplateColumns = `repeat(${cols}, ${G.w}mm)`; page.style.gridAutoRows = `${G.h}mm`;
      sheet.appendChild(page);
    }
    return page;
  };
  // QR sits on the fixed side; smaller by default to leave room for text.
  const fixed = G.port ? G.w : G.h;
  const topName = S.nameMode === "top" && S.qr.pos !== "qr-top" && S.fields.name.on;
  const qrBase = S.qr.pos==="qr-top" ? Math.min(G.w, G.h)*0.62 : fixed*(topName ? 0.8 : 0.85);
  let qrMm = qrBase * (S.qr.size/100) * (S.qr.showId ? 0.84 : 1);
  qrMm = Math.max(Math.min(10, fixed*0.55), qrMm);

  labels.forEach((L,li) => {
    const el = document.createElement("div");
    el.className = "label " + (S.qr.on ? S.qr.pos : "text-only") + (G.round ? " round" : "") + (G.auto && !G.port ? " fit" : "");
    el.style.fontFamily = S.font;
    el.style.width = G.auto && !G.port ? "auto" : G.w + "mm";
    el.style.height = G.auto && G.port ? "auto" : G.h + "mm";
    if(G.auto){ if(G.port) el.style.minHeight = "25.4mm"; else el.style.minWidth = "25.4mm"; }
    const lines = []; let title = "";
    const tt = S.nameMode === "top" && S.qr.pos !== "qr-top" && S.fields.name.on && val(L,"name");
    if(tt) el.classList.add("tt");
    GROUPS.forEach(Gr => Gr.f.forEach(([key,,short]) => {
      const f = S.fields[key], v = val(L,key);
      if(!f.on || !v) return;
      if(tt && key === "name"){ title = `<div class="ttl${wrapTitle ? " wrap" : ""}" style="font-size:${(f.size*k).toFixed(2)}pt;font-weight:${f.bold?700:400};font-style:${f.italic?"italic":"normal"};color:${f.color};text-align:${S.align}">${esc(v)}</div>`; return; }
      const st = `font-size:${(f.size*k).toFixed(2)}pt;font-weight:${f.bold?700:400};font-style:${f.italic?"italic":"normal"};color:${f.color}`;
      lines.push(`<div class="ln" style="${st}">${f.label ? `<span class="k">${esc(short)} </span>` : ""}${esc(v)}</div>`);
    }));
    const txt = lines.length ? `<div class="txt" style="text-align:${S.align}">${lines.join("")}</div>` : "";
    const idSize = Math.max(5, Math.min(12, qrMm/3.2)) * Math.min(k, 1.4);
    const qr = S.qr.on ? `<div class="qr"><div class="code" style="width:${qrMm}mm;height:${qrMm}mm;margin:0 auto"></div>${S.qr.showId ? `<div class="sid" style="font-size:${idSize.toFixed(2)}pt">${esc(L.id)}</div>` : ""}</div>` : "";
    el.innerHTML = tt ? title + `<div class="bd">${qr + txt}</div>` : qr + txt;
    if(!printing && queue.length && queue[li]){
      const rec = queue[li].rec, on = picked.has(rec);
      el.classList.add("pickable", on ? "picked" : "unpicked");
      el.insertAdjacentHTML("beforeend", `<span class="pick" aria-hidden="true">${on ? "✓" : ""}</span>`);
      el.setAttribute("role","checkbox"); el.setAttribute("aria-checked", String(on)); el.tabIndex = 0;
      el.title = on ? "Selected. Click to skip this label." : "Not selected. Click to print this label.";
      const toggle = () => { if(picked.has(rec)) picked.delete(rec); else picked.add(rec); render(); };
      el.addEventListener("click", toggle);
      el.addEventListener("keydown", e => { if(e.key===" "||e.key==="Enter"){ e.preventDefault(); toggle(); } });
    }
    holder(li).appendChild(el);
    const code = el.querySelector(".code");
    if(code && real){
      const px = Math.max(64, Math.round(qrMm * MM * 3));
      new QRCode(code,{text:L.url||L.id,width:px,height:px,correctLevel:QRCode.CorrectLevel.M});
      code.querySelectorAll("canvas,img").forEach(n => { n.style.width = qrMm+"mm"; n.style.height = qrMm+"mm"; });
    }
  });

  let w = G.w, h = G.h;
  if(G.auto){
    const els = [...sheet.querySelectorAll(".label")];
    const need = Math.max(...els.map(e => G.port ? e.scrollHeight : e.scrollWidth)) / MM + 1;
    const len = Math.max(25.4, Math.ceil(need/2.54)*2.54);
    els.forEach(e => { if(G.port) e.style.height = len+"mm"; else e.style.width = len+"mm"; });
    if(G.port) h = len; else w = len;
  }
  let over = 0;
  sheet.querySelectorAll(".label").forEach(e => {
    const t = e.querySelector(".txt");
    const ttl = e.querySelector('.ttl'), bd = e.querySelector('.bd');
    const bad = (t && (t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1)) || (ttl && ttl.scrollWidth > ttl.clientWidth + 1) || (bd && bd.scrollHeight > bd.clientHeight + 1) || e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1;
    e.classList.toggle("over", bad); if(bad) over++;
  });
  return {over, w, h, per, tiled, qrMm, len: G.port ? h : w};
}

function render(){
  const G = geometry();
  let labels = readLabels(); const demo = !labels.length; if(demo) labels = SAMPLE;
  const nPick = queue.filter(q => picked.has(q.rec)).length;
  $("count").textContent = demo ? "Example preview. Queue samples in Airtable to print real labels."
    : printing ? "" : `${nPick} of ${labels.length} selected`;
  $("print").disabled = demo || (!printing && nPick === 0);
  $("qall").classList.toggle("is-hidden", demo); $("qnone").classList.toggle("is-hidden", demo);

  let k = S.scale/100, wrap = false;
  const solve = w => {
    const maxK = G.auto ? 1.6 : 3, minK = 0.35;
    const fits = x => { const r = draw(G, labels, x, false, w); return r.over === 0 && (!G.auto || r.len <= Math.max(G.port ? G.w : G.h, 25.4) * 2.2 || x <= 1); };
    if(fits(maxK)) return maxK * 0.95;
    if(!fits(minK)) return minK;
    let lo = minK, hi = maxK; for(let i = 0; i < 9; i++){ const mid = (lo+hi)/2; if(fits(mid)) lo = mid; else hi = mid; }
    return lo * 0.95;   // 5% breathing room
  };
  if(S.autoFit){
    // Largest text scale where every label fits. If a one-line name across the top would shrink the
    // name below ~8 pt, let it wrap to two lines instead so everything stays readable.
    k = solve(false);
    const topName = S.nameMode === "top" && S.qr.pos !== "qr-top" && S.fields.name.on;
    if(topName && k * S.fields.name.size < 8){ const k2 = solve(true); if(k2 > k){ k = k2; wrap = true; } }
  }
  const r = draw(G, labels, k, true, wrap);
  const {w, h, per, tiled, qrMm} = r;

  const fix = G.cont ? `Switch to "Fit to content", make it longer, or use smaller text.` : `Use smaller text, fewer fields, a smaller QR code, or a bigger size.`;
  $("warn").textContent = r.over ? `${r.over} label${r.over>1?"s are":" is"} cut off (outlined in red). ${S.autoFit ? "Even the smallest text doesn't fit. Turn off some fields or shrink the QR code." : fix}` : "";
  $("qrTip").textContent = qrMm < 12 ? `QR is ${(qrMm/25.4).toFixed(2)}" wide. Below about 0.5" some phones need to be held close to scan.` : `QR is ${(qrMm/25.4).toFixed(2)}" wide.`;
  $("fitTip").textContent = S.autoFit ? `Text is at ${Math.round(k*100)}% of the field sizes, the largest that fits.` : "";

  if(tiled) pageStyle.textContent = `@media print{@page{size:8.5in 11in;margin:0}}`;
  else pageStyle.textContent = `@media print{@page{size:${w.toFixed(2)}mm ${h.toFixed(2)}mm;margin:0}}`;
  const size = `${(w/25.4).toFixed(2)}" × ${(h/25.4).toFixed(2)}"`;
  $("dims").textContent = tiled ? `${G.name} · ${size} · ${per} per letter sheet · ${Math.ceil(labels.length/per)} sheet${Math.ceil(labels.length/per)>1?"s":""}` : `${G.name} · ${size}`;
  applyZoom();
}

function changed(){ $("tpl").value = ""; $("del").classList.add("is-hidden"); syncControls(); render(); }

