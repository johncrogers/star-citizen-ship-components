// Trade-offs: parts of one type and size as dots on two numbers that pull against each other
// (shield HP vs regen, cooling vs IR signature...). Parts nothing else beats on both are the best
// trade-offs and get labelled.
(function () {
  const { esc, fmt, items, bestPrice, Owned, Wishlist, statInfo } = window.Parts;

  const price = { key: "price", label: "Price", unit: "aUEC", better: "low", get: (s) => bestPrice(s) };
  const stat = (key) => ({ ...statInfo.get(key), get: (s) => s.stats[key] ?? null });
  // For each part type: the main number across, and the numbers you can put up the side.
  const TYPES = [
    ["Shield", "Shield", "shieldHp", ["shieldRegen", "downedDelay", "em", "price"]],
    ["PowerPlant", "Power plant", "powerOut", ["em", "price", "hp"]],
    ["Cooler", "Cooler", "coolOut", ["ir", "power", "price"]],
    ["QuantumDrive", "Quantum drive", "qtSpeed", ["spool", "qtFuel", "qtCooldown", "price"]],
    ["WeaponGun", "Gun", "dps", ["rangeM", "alpha", "sustained", "price", "power"]],
    ["Missile", "Missile & torpedo", "damage", ["lockTime", "lockRange", "speed", "price"]],
    ["WeaponMining", "Mining laser", "minePower", ["optRange", "extract", "moduleSlots", "price"]],
    ["Radar", "Radar", "aimRange", ["price", "power"]],
  ].map(([kind, label, x, ys]) => ({ kind, label, x, ys }));
  const metric = (k) => (k === "price" ? price : stat(k));

  const KEY = "sc-ship-components:tradeoffs";
  const opts = { kind: "Shield", size: null, y: null, cls: "", sold: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* storage unavailable */ } };
  const type = () => TYPES.find((t) => t.kind === opts.kind) || TYPES[0];
  const ofType = (t) => items.filter((s) => s.kind && s.kind.split(".")[0] === t.kind && s.stats.size != null);
  const sizes = (t) => [...new Set(ofType(t).map((s) => s.stats.size))].sort((a, b) => a - b);
  const status = (s) => (Owned.isOwned(s.id) ? "owned" : Wishlist.isWanted(s.id) ? "wanted" : "other");
  const short = (n) => (Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : `${+n.toFixed(n < 10 ? 2 : 0)}`);
  const lower = (t) => t.replace(/^./, (c) => c.toLowerCase());

  function setup() {
    const t = type();
    const ss = sizes(t);
    if (!ss.includes(opts.size)) opts.size = ss.includes(2) ? 2 : ss[0];
    if (!t.ys.includes(opts.y)) opts.y = t.ys[0];
    return { t, ss, X: metric(t.x), Y: metric(opts.y) };
  }

  // A part is a best trade-off when no other part is at least as good on both and better on one.
  function best(pts, X, Y) {
    const better = (m, a, b) => (m.better === "low" ? a <= b : a >= b);
    const strictly = (m, a, b) => (m.better === "low" ? a < b : a > b);
    return new Set(pts.filter((p) => !pts.some((q) => q !== p && better(X, q.x, p.x) && better(Y, q.y, p.y) && (strictly(X, q.x, p.x) || strictly(Y, q.y, p.y)))));
  }

  function plot(pts, front, X, Y, width) {
    const W = Math.max(320, width), H = W < 600 ? 340 : 420;
    const pad = { l: 60, r: 18, t: 14, b: 42 };
    const ext = (vals) => {
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
      // A little room on each side, without going below zero for numbers that can't.
      const p = (hi - lo) * 0.08;
      return [lo >= 0 ? Math.max(0, lo - p) : lo - p, hi + p];
    };
    const [x0, x1] = ext(pts.map((p) => p.x)), [y0, y1] = ext(pts.map((p) => p.y));
    const sx = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
    const sy = (v) => H - pad.b - ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    const ticks = (lo, hi) => {
      const raw = (hi - lo) / 5, mag = 10 ** Math.floor(Math.log10(raw || 1));
      const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => raw <= k);
      const out = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
      return out;
    };
    const unit = (m) => (m.unit ? ` (${m.unit})` : "");
    const grid = ticks(y0, y1).map((v) => `<line class="vm-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}"/><text class="vm-tick" x="${pad.l - 6}" y="${sy(v) + 4}" text-anchor="end">${short(v)}</text>`).join("") +
      ticks(x0, x1).map((v) => `<text class="vm-tick" x="${sx(v)}" y="${H - pad.b + 16}" text-anchor="middle">${short(v)}</text>`).join("");
    const arrow = (m) => (m.better === "low" ? "lower is better" : "higher is better");
    const axes = `<line class="vm-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"/>
      <text class="vm-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(X.label + unit(X))}, ${arrow(X)}</text>
      <text class="vm-label" transform="translate(14 ${(pad.t + H - pad.b) / 2}) rotate(-90)" text-anchor="middle">${esc(Y.label + unit(Y))}, ${arrow(Y)}</text>`;
    const order = (p) => (front.has(p) ? 2 : 0) + (p.st !== "other" ? 1 : 0);
    const dots = [...pts].sort((a, b) => order(a) - order(b)).map((p) => {
      const s = p.s;
      const tip = `${s.name} · ${[s.class, s.grade && `grade ${s.grade}`].filter(Boolean).join(" ")} · ${X.label} ${fmt(p.x)}${X.unit ? " " + X.unit : ""} · ${Y.label} ${fmt(p.y)}${Y.unit ? " " + Y.unit : ""}${bestPrice(s) != null && Y.key !== "price" ? ` · ${fmt(bestPrice(s))} aUEC` : s.buy.length ? "" : " · not sold in game"}${front.has(p) ? " · best trade-off" : ""}${p.st !== "other" ? ` · ${p.st}` : ""}`;
      return `<a href="#${esc(s.id)}" class="vm-pt to-pt ${front.has(p) ? "front" : "back"} ${p.st}${s.buy.length ? "" : " unsold"}" data-tip="${esc(tip)}">
        <circle class="vm-hit" cx="${sx(p.x)}" cy="${sy(p.y)}" r="9"/><circle class="vm-dot" cx="${sx(p.x)}" cy="${sy(p.y)}" r="${front.has(p) || p.st !== "other" ? 5 : 4}"/></a>`;
    }).join("");
    const placed = [];
    const labels = pts.filter((p) => front.has(p) || p.st !== "other").sort((a, b) => order(b) - order(a)).map((p) => {
      const X0 = sx(p.x) + 8, Y0 = sy(p.y) + 4, w = p.s.name.length * 6.2;
      const right = X0 + w > W - pad.r;
      const box = right ? [X0 - 16 - w, Y0 - 10, X0 - 16, Y0 + 2] : [X0, Y0 - 10, X0 + w, Y0 + 2];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return "";
      placed.push(box);
      return `<text class="vm-name" x="${right ? X0 - 16 : X0}" y="${Y0}" text-anchor="${right ? "end" : "start"}">${esc(p.s.name)}</text>`;
    }).join("");
    return `<svg class="vm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(X.label)} against ${esc(Y.label)}">${grid}${axes}${dots}${labels}</svg>`;
  }

  function render(el) {
    const { t, ss, X, Y } = setup();
    const classes = [...new Set(ofType(t).map((s) => s.class).filter(Boolean))].sort();
    const pts = ofType(t)
      .filter((s) => s.stats.size === opts.size && (!opts.cls || s.class === opts.cls) && (!opts.sold || s.buy.length))
      .map((s) => ({ s, x: X.get(s), y: Y.get(s), st: status(s) }))
      .filter((p) => p.x != null && p.y != null);
    const front = best(pts, X, Y);
    const list = [...front].sort((a, b) => (X.better === "low" ? a.x - b.x : b.x - a.x));
    const width = (el.clientWidth || 1000) - 42;
    const sel = (k, options, cur) => `<select data-to="${k}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    el.innerHTML = `<div class="cmp-card to-card">
      <h3>Trade-offs</h3>
      <p class="muted">Parts of one type and size, on two numbers that pull against each other. Blue parts are the best trade-offs: nothing else is as good on both. Gray parts are beaten on both by at least one blue part.</p>
      <div class="vm-controls">
        <label>Part ${sel("kind", TYPES.map((x) => [x.kind, x.label]), t.kind)}</label>
        <label>Size ${sel("size", ss.map((x) => [x, `S${x}`]), opts.size)}</label>
        <label>${esc(X.label)} against ${sel("y", t.ys.map((k) => [k, metric(k).label]), opts.y)}</label>
        ${classes.length ? `<label>Class ${sel("cls", [["", "All"], ...classes.map((c) => [c, c])], opts.cls)}</label>` : ""}
        <label class="vm-check"><input type="checkbox" data-to="sold"${opts.sold ? " checked" : ""}> Sold in shops only</label>
      </div>
      <div class="legend"><span><i class="to-key front"></i>Best trade-off</span><span><i class="to-key back"></i>Beaten</span><span><i class="to-key owned"></i>Owned</span><span><i class="to-key wanted"></i>Wanted</span><span><i class="to-key unsold"></i>Not sold in game</span></div>
      <div class="to-plot">${pts.length ? "" : `<p class="empty">No S${opts.size} ${esc(lower(t.label))}s have both numbers.</p>`}</div>
      <div class="vm-tip" role="tooltip" hidden></div>
      <p class="note">${pts.length} part${pts.length === 1 ? "" : "s"}. Hover a dot for its numbers, click to open it.</p>
      ${list.length ? `<h3>Best trade-offs</h3><div class="cmp-scroll"><table><thead><tr><th>Part</th><th>Class</th><th class="num">${esc(X.label)}</th><th class="num">${esc(Y.label)}</th><th class="num">aUEC</th></tr></thead><tbody>
        ${list.map((p) => `<tr><td><a href="#${esc(p.s.id)}">${esc(p.s.name)}</a>${p.st !== "other" ? ` <small class="to-st ${p.st}">${p.st}</small>` : ""}</td><td>${esc([p.s.class, p.s.grade].filter(Boolean).join(" "))}</td>
          <td class="num">${fmt(p.x)}</td><td class="num">${fmt(p.y)}</td><td class="num">${bestPrice(p.s) != null ? fmt(bestPrice(p.s)) : `<span class="muted">not sold</span>`}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
    </div>`;
    const box = el.querySelector(".to-plot");
    if (pts.length) box.innerHTML = plot(pts, front, X, Y, box.clientWidth || width);
  }

  function bind(el, rerender) {
    el.addEventListener("change", (e) => {
      const k = e.target.dataset.to;
      if (!k) return;
      if (k === "sold") opts.sold = e.target.checked;
      else if (k === "size") opts.size = +e.target.value;
      else {
        opts[k] = e.target.value;
        if (k === "kind") { opts.y = null; opts.cls = ""; }
      }
      save();
      rerender();
    });
    const show = (e) => {
      const tip = el.querySelector(".to-card .vm-tip");
      if (!tip) return;
      const pt = e.target.closest && e.target.closest(".to-pt");
      if (!pt) { tip.hidden = true; return; }
      const card = el.querySelector(".to-card").getBoundingClientRect();
      const r = pt.querySelector(".vm-dot").getBoundingClientRect();
      tip.textContent = pt.dataset.tip;
      tip.hidden = false;
      tip.style.left = `${Math.max(8, Math.min(r.left - card.left + 12, card.width - tip.offsetWidth - 8))}px`;
      tip.style.top = `${r.top - card.top - tip.offsetHeight - 8}px`;
    };
    el.addEventListener("mouseover", show);
    el.addEventListener("focusin", show);
  }

  window.TradeOffs = { render, bind };
})();
