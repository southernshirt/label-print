// ---------- build controls ----------
ROLLS.forEach(r => $("roll").add(new Option(r.n, r.k)));
BADGES.forEach(b => $("badge").add(new Option(b.n, b.k)));
PRESETS.forEach((p,i) => {
  const b = document.createElement("button"); b.type = "button"; b.className = "preset";
  b.innerHTML = `<b>${p.n}</b><span>${p.d}</span>`;
  b.addEventListener("click", () => { p.set(S); changed(); });
  $("presets").appendChild(b);
});
function buildGroups(){
  GROUPS.forEach((G,gi) => {
    const d = document.createElement("details"); d.className = "fg"; if(gi === 0) d.open = true;
    d.innerHTML = `<summary>${G.g}<span class="cnt" data-g="${gi}"></span></summary><div class="fbody"></div>`;
    const body = d.querySelector(".fbody");
    G.f.forEach(([k,label]) => {
      const row = document.createElement("div"); row.className = "frow";
      row.innerHTML = `
        <div class="chk"><input type="checkbox" id="on-${k}"><label for="on-${k}">${label}</label></div>
        <div class="fstyle" id="st-${k}">
          <input class="inp" type="number" id="sz-${k}" min="4" max="72" step="0.5" aria-label="${label} size in points" title="Size (pt)">
          <button type="button" class="tog" id="b-${k}" aria-label="Bold" title="Bold"><b>B</b></button>
          <button type="button" class="tog" id="i-${k}" aria-label="Italic" title="Italic"><i>I</i></button>
          <select class="sel" id="c-${k}" aria-label="${label} color">${COLORS.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select>
        </div>
        <div class="chk showlbl" id="lw-${k}"><input type="checkbox" id="l-${k}"><label for="l-${k}">Show field name</label></div>`;
      body.appendChild(row);
      const f = () => S.fields[k];
      row.querySelector(`#on-${k}`).addEventListener("change", e => { f().on = e.target.checked; changed(); });
      row.querySelector(`#sz-${k}`).addEventListener("input", e => { f().size = Number(e.target.value)||7; changed(); });
      row.querySelector(`#b-${k}`).addEventListener("click", () => { f().bold = !f().bold; changed(); });
      row.querySelector(`#i-${k}`).addEventListener("click", () => { f().italic = !f().italic; changed(); });
      row.querySelector(`#c-${k}`).addEventListener("change", e => { f().color = e.target.value; changed(); });
      row.querySelector(`#l-${k}`).addEventListener("change", e => { f().label = e.target.checked; changed(); });
    });
    $("groups").appendChild(d);
  });
}
buildGroups();

// tabs
["paper","layout","content"].forEach(t => $("t-"+t).addEventListener("click", () => {
  ["paper","layout","content"].forEach(o => { $("t-"+o).setAttribute("aria-selected", String(o===t)); $("p-"+o).classList.toggle("is-hidden", o!==t); });
}));
document.querySelectorAll("[data-z]").forEach(b => b.addEventListener("click", () => {
  zoom = Number(b.dataset.z); document.querySelectorAll("[data-z]").forEach(x => x.setAttribute("aria-pressed", String(x===b))); applyZoom();
}));
function applyZoom(){ $("sheet").style.zoom = zoom; }

const pressed = (id,on) => $(id).setAttribute("aria-pressed", String(on));
function syncControls(){
  const brother = S.media === "brother";
  pressed("m-brother", brother); pressed("m-badge", !brother);
  $("brotherBox").classList.toggle("is-hidden", !brother); $("badgeBox").classList.toggle("is-hidden", brother);
  $("roll").value = S.roll; $("badge").value = S.badge; $("len").value = S.lenIn;
  const roll = ROLLS.find(r => r.k === S.roll);
  $("lenBox").classList.toggle("is-hidden", !roll.cont);
  $("lenFixedBox").classList.toggle("is-hidden", S.lenMode !== "fixed");
  pressed("len-auto", S.lenMode==="auto"); pressed("len-fixed", S.lenMode==="fixed");
  $("lenTip").textContent = S.lenMode==="auto" ? "The label grows as long as the content needs, so nothing gets cut off." : "Every label prints at this length. Anything that doesn't fit is flagged.";
  pressed("o-land", S.orient==="land"); pressed("o-port", S.orient==="port");
  pressed("b-tile", S.badgeMode==="tile"); pressed("b-single", S.badgeMode==="single");
  $("badgeTip").textContent = S.badgeMode==="tile" ? "Prints on 8.5 × 11 paper or card stock with dashed cut lines. Cut and slide into the holder." : "One badge per page at its exact size, for perforated insert sheets fed one at a time.";
  $("font").value = S.font; $("align").value = S.align; $("scale").value = S.scale;
  $("nameMode").value = S.nameMode || "inline"; $("autofit").checked = !!S.autoFit; $("scaleBox").classList.toggle("is-hidden", !!S.autoFit);
  $("qr-on").checked = S.qr.on; $("qr-pos").value = S.qr.pos; $("qr-size").value = S.qr.size; $("qr-id").checked = S.qr.showId;
  $("qrBox").classList.toggle("is-hidden", !S.qr.on);
  GROUPS.forEach((G,gi) => {
    let n = 0;
    G.f.forEach(([k]) => {
      const f = S.fields[k]; if(f.on) n++;
      $("on-"+k).checked = f.on; $("sz-"+k).value = f.size; pressed("b-"+k, !!f.bold); pressed("i-"+k, !!f.italic);
      $("c-"+k).value = f.color; $("l-"+k).checked = !!f.label;
      $("st-"+k).classList.toggle("is-hidden", !f.on); $("lw-"+k).classList.toggle("is-hidden", !f.on);
    });
    document.querySelector(`.cnt[data-g="${gi}"]`).textContent = n ? `${n} on` : "";
  });
}

