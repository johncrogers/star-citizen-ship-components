// Loadout planner and saved builds. A build is a ship plus "picks": the slots I changed from stock.
// Everything else (totals, cost, shopping list) is worked out from the ship's stock loadout and
// those picks, so a data refresh updates every build.
(function () {
  const {
    esc, fmt, published, siteLink, itemById, ships, shipById, bestPrice, cheapest, candidates, fits,
    Owned, Builds, statInfo, keyStat, keyStatText, tagClass,
  } = window.Parts;

  const shipsHref = siteLink("ships");
  const locationsHref = siteLink("locations");
  const shopLink = (b) =>
    locationsHref && b.code
      ? `<a href="${esc(locationsHref)}#code:${encodeURIComponent(b.code)}" title="Where it is and how to get there">${esc(b.location)}</a>`
      : esc(b.location);

  const state = { ship: null, build: null };
  let changeListeners = [];
  const changed = () => changeListeners.forEach((fn) => fn());

  // ── Resolving a loadout ────────────────────────────────────────────────────
  const typeOf = (t) => t.split(".")[0];
  const MOUNT_TYPES = new Set(["Gimbal mount", "Fixed mount"]);

  // The slots inside a container that isn't the stock one: from the new item's own slot list.
  // A slot keeps the old stock part when it still fits (swapping a rack keeps its missiles).
  function swappedChildren(def, item, shipId) {
    const old = new Map((def.c || []).map((c) => [c.p, c]));
    return (item.slots || []).map((sl) => {
      const prev = old.get(sl.p) || (def.c || []).find((c) => c.t.some((t) => sl.t.includes(t)));
      const keep = prev && prev.i && fits(itemById.get(prev.i), sl, shipId) ? prev.i : undefined;
      return { ...sl, e: 1, i: keep };
    });
  }

  // def: a slot from the catalog ({p, l, t, s, e, i, x, c}). Returns a resolved node.
  function resolve(def, path, picks, shipId) {
    const has = Object.prototype.hasOwnProperty.call(picks, path);
    const stockKey = def.i || (def.x ? "x" : null);
    const curKey = has ? picks[path] || null : stockKey;
    const cur = curKey && curKey !== "x" ? itemById.get(curKey) || null : null;
    const isChanged = curKey !== stockKey;
    let kids = [];
    if (!isChanged) kids = def.c || [];
    else if (cur) kids = swappedChildren(def, cur, shipId);
    return {
      path, def, shipId, label: def.l, types: def.t, size: def.s, editable: !!def.e,
      stockId: def.i || null, stockName: def.x || null, curKey, cur, changed: isChanged,
      children: kids.map((c) => resolve(c, `${path}/${c.p}`, picks, shipId)),
    };
  }
  const resolveShip = (ship, picks) => ship.slots.map((d) => resolve(d, d.p, picks || {}, ship.id));
  const walk = (nodes, fn, up = []) => nodes.forEach((n) => { fn(n, up); walk(n.children, fn, [...up, n]); });
  const curName = (n) => (n.cur ? n.cur.name : n.curKey === "x" ? n.stockName : "Empty");

  const TURRET_RE = /turret|point defense/i;
  const isTurretNode = (n) =>
    n.types.some((t) => typeOf(t) === "TurretBase") ||
    (n.cur ? TURRET_RE.test(n.cur.type) && !MOUNT_TYPES.has(n.cur.type) : n.curKey === "x" && TURRET_RE.test(n.stockName || ""));

  // ── Totals ─────────────────────────────────────────────────────────────────
  function totals(tree) {
    const t = {
      pilotDps: 0, pilotSustained: 0, pilotAlpha: 0, turretDps: 0, guns: 0,
      missiles: 0, missileDamage: 0, shieldHp: 0, shieldRegen: 0,
      powerOut: 0, powerDraw: 0, coolOut: 0, coolDraw: 0, qtSpeed: null, spool: null,
      minePower: 0, em: 0, ir: 0,
    };
    walk(tree, (n, up) => {
      const s = n.cur && n.cur.stats;
      if (!s) return;
      const [type] = n.cur.kind.split(".");
      if (type === "WeaponGun") {
        t.guns++;
        if (up.some(isTurretNode) || isTurretNode(n)) t.turretDps += s.dps || 0;
        else {
          t.pilotDps += s.dps || 0;
          t.pilotSustained += s.sustained || 0;
          t.pilotAlpha += s.alpha || 0;
        }
      }
      if (type === "Missile" || type === "Bomb") {
        t.missiles++;
        t.missileDamage += s.damage || 0;
      }
      if (type === "Shield") { t.shieldHp += s.shieldHp || 0; t.shieldRegen += s.shieldRegen || 0; }
      if (type === "PowerPlant") t.powerOut += s.powerOut || 0;
      else t.powerDraw += s.power || 0;
      if (type === "Cooler") t.coolOut += s.coolOut || 0;
      t.coolDraw += s.coolant || 0;
      if (type === "QuantumDrive" && t.qtSpeed == null) { t.qtSpeed = s.qtSpeed ?? null; t.spool = s.spool ?? null; }
      if (type === "WeaponMining") t.minePower += s.minePower || 0;
      t.em += s.em || 0;
      t.ir += s.ir || 0;
    });
    for (const k of Object.keys(t)) if (typeof t[k] === "number") t[k] = Math.round(t[k] * 10) / 10;
    return t;
  }

  const TOTAL_ROWS = [
    ["pilotDps", "Pilot DPS", "", "high"],
    ["pilotSustained", "Pilot sustained DPS", "", "high"],
    ["pilotAlpha", "Pilot damage per volley", "", "high"],
    ["turretDps", "Turret DPS", "", "high"],
    ["missiles", "Missiles & bombs", "", "high"],
    ["missileDamage", "Missile damage", "", "high"],
    ["shieldHp", "Shield HP", "", "high"],
    ["shieldRegen", "Shield regen", "HP/s", "high"],
    ["powerOut", "Power output", "segments", "high"],
    ["powerDraw", "Power draw (all at max)", "segments", "low"],
    ["coolOut", "Cooling", "segments", "high"],
    ["coolDraw", "Coolant draw", "segments", "low"],
    ["qtSpeed", "Quantum speed", "Mm/s", "high"],
    ["spool", "Quantum spool", "s", "low"],
    ["minePower", "Mining laser power", "", "high"],
    ["em", "EM signature (all on)", "", "low"],
    ["ir", "IR signature (all on)", "", "low"],
  ];

  function diffHtml(a, b, better) {
    if (a == null || b == null) return "";
    const d = Math.round((b - a) * 10) / 10;
    if (!d) return "";
    const good = better === "low" ? d < 0 : d > 0;
    return `<span class="diff ${good ? "good" : "bad"}">${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}</span>`;
  }

  // What the changed slots cost: parts I already own (as many as I own) are free.
  function shopping(tree) {
    const need = new Map();
    walk(tree, (n) => {
      if (!n.changed || !n.cur) return;
      need.set(n.cur.id, (need.get(n.cur.id) || 0) + 1);
    });
    const rows = [...need].map(([id, qty]) => {
      const item = itemById.get(id);
      const owned = Math.min(qty, Owned.count(id));
      const buy = qty - owned;
      const price = bestPrice(item);
      return { item, qty, owned, buy, price, shop: cheapest(item), cost: price != null ? price * buy : null };
    });
    rows.sort((a, b) => (b.cost || 0) - (a.cost || 0) || a.item.name.localeCompare(b.item.name));
    return {
      rows,
      total: rows.reduce((sum, r) => sum + (r.cost || 0), 0),
      unpriced: rows.filter((r) => r.buy > 0 && r.price == null),
      ownedParts: rows.reduce((sum, r) => sum + r.owned, 0),
    };
  }

  // ── Grouping slots for display ─────────────────────────────────────────────
  const GROUPS = [
    ["weapons", "Pilot weapons"],
    ["turrets", "Turrets"],
    ["missiles", "Missiles & bombs"],
    ["components", "Components"],
    ["utility", "Mining, salvage & utility"],
    ["paint", "Paint"],
  ];
  const COMPONENT_ORDER = ["PowerPlant", "Shield", "Cooler", "QuantumDrive", "JumpDrive", "Radar"];
  const UTILITY = new Set(["WeaponMining", "MiningModifier", "SalvageHead", "SalvageModifier", "TractorBeam", "TowingBeam", "QuantumInterdictionGenerator", "EMP"]);
  function groupOf(n) {
    const types = new Set();
    walk([n], (x) => { x.types.forEach((t) => types.add(typeOf(t))); if (x.cur) types.add(typeOf(x.cur.kind)); });
    if (types.has("Paints")) return "paint";
    if ([...types].some((t) => UTILITY.has(t))) return "utility";
    if (["MissileLauncher", "BombLauncher", "GroundVehicleMissileLauncher", "Missile", "Bomb"].some((t) => types.has(t))) return "missiles";
    if (COMPONENT_ORDER.some((t) => types.has(t))) return "components";
    if (isTurretNode(n)) return "turrets";
    return "weapons";
  }
  const componentRank = (n) => {
    const i = COMPONENT_ORDER.findIndex((t) => n.types.some((x) => typeOf(x) === t));
    return i < 0 ? 99 : i;
  };

  // ── Rendering slots ────────────────────────────────────────────────────────
  const sizeText = (s) => (!s || !(s[0] || s[1]) ? "" : s[0] === s[1] ? `S${s[1]}` : `S${s[0]}–${s[1]}`);
  function optionLabel(item, n) {
    const price = bestPrice(item);
    const bits = [
      item.stats.size != null && item.kind.split(".")[0] !== "Paints" ? `S${item.stats.size}` : null,
      item.grade ? `${item.class ? item.class + " " : ""}${item.grade}` : item.class,
      MOUNT_TYPES.has(item.type) ? null : keyStatText(item),
      price != null ? `${fmt(price)} aUEC` : "not sold",
      Owned.isOwned(item.id) ? "owned" : null,
      item.id === n.stockId ? "stock" : null,
    ].filter(Boolean);
    return `${item.name} · ${bits.join(" · ")}`;
  }
  // Parts that fit a slot: best key stat first, parts you can buy in game before ones you can't.
  function slotOptions(n) {
    const k = keyStat(n.cur || itemById.get(n.stockId));
    const opts = candidates(n.def, n.shipId);
    opts.sort((a, b) => (k ? (b.stats[k.key] || 0) - (a.stats[k.key] || 0) : 0) || a.name.localeCompare(b.name));
    if (n.cur && !opts.includes(n.cur)) opts.unshift(n.cur);
    return opts;
  }
  // A slot the game marks as changeable, but with nothing in the catalog to put there.
  const swappable = (n) => n.editable && slotOptions(n).some((o) => o.id !== n.stockId);

  function slotSelect(n, paths) {
    const opts = slotOptions(n);
    const val = paths ? paths.value : n.curKey || "";
    const option = (o) => `<option value="${esc(o.id)}"${o.id === val ? " selected" : ""}>${esc(optionLabel(o, n))}</option>`;
    const sold = opts.filter((o) => o.buy.length);
    const unsold = opts.filter((o) => !o.buy.length);
    const html = [
      paths && val === "__mixed" ? `<option value="__mixed" selected>Mixed (see below)</option>` : "",
      n.stockName ? `<option value="x"${val === "x" ? " selected" : ""}>${esc(n.stockName)} · stock</option>` : "",
      `<option value=""${val === "" ? " selected" : ""}>${n.types.includes("Paints") ? "Default paint" : "— Empty —"}</option>`,
      sold.length ? `<optgroup label="In shops">${sold.map(option).join("")}</optgroup>` : "",
      unsold.length ? `<optgroup label="Not sold in game">${unsold.map(option).join("")}</optgroup>` : "",
    ].join("");
    const target = paths ? `data-slots="${esc(paths.list.join("|"))}"` : `data-slot="${esc(n.path)}"`;
    return `<select class="slot-select" ${target} aria-label="${esc(n.label)}">${html}</select>`;
  }

  function slotStat(n) {
    const item = n.cur;
    if (!item || MOUNT_TYPES.has(item.type)) return "";
    const k = keyStat(item);
    const v = k && item.stats[k.key];
    if (v == null) return "";
    const stock = n.changed ? itemById.get(n.stockId) : null;
    const delta = stock && stock.kind === item.kind ? diffHtml(stock.stats[k.key], v, k.better) : "";
    return `${fmt(v)}${k.unit ? ` <small>${esc(k.unit)}</small>` : ""} <small>${esc(k.key === "dps" ? "DPS" : k.label.toLowerCase())}</small> ${delta}`;
  }

  function slotPrice(n) {
    if (!n.changed) return `<span class="muted">stock</span>`;
    if (!n.cur) return `<span class="muted">removed</span>`;
    if (Owned.isOwned(n.cur.id)) return `<span class="price buy">owned</span>`;
    const p = bestPrice(n.cur);
    return p != null ? `<span class="price buy">${fmt(p)}</span>` : `<span class="price none">not sold</span>`;
  }

  // Siblings with the same slot type and size (e.g. 4 missile slots on a rack) show as one row.
  const sameShape = (a, b) => a.types.join() === b.types.join() && sizeText(a.size) === sizeText(b.size) && !a.children.length && !b.children.length && a.editable && b.editable;

  function rowsHtml(nodes, depth, matches) {
    const out = [];
    let i = 0;
    while (i < nodes.length) {
      const n = nodes[i];
      let j = i + 1;
      while (j < nodes.length && sameShape(n, nodes[j])) j++;
      const run = nodes.slice(i, j);
      if (run.length > 1 && depth > 0) {
        out.push(groupRow(run, depth));
      } else {
        out.push(slotRow(n, depth, matches));
        if (n.children.length) out.push(rowsHtml(n.children, depth + 1, matches));
      }
      i = run.length > 1 && depth > 0 ? j : i + 1;
    }
    return out.join("");
  }

  function slotRow(n, depth, matches) {
    const mount = n.cur && MOUNT_TYPES.has(n.cur.type);
    const fixedName = n.cur ? n.cur.name : n.stockName || "Empty";
    const twins = matches.get(n.group + "|" + shapeKey(n)) || [];
    const canApply = n.editable && n.changed && twins.length > 1 && twins.some((t) => t.curKey !== n.curKey);
    const open = n.changed || swappable(n);
    return `<div class="slot-row d${Math.min(depth, 3)}${n.changed ? " changed" : ""}${mount ? " mount" : ""}">
      <div class="slot-label">${esc(n.label)} ${sizeText(n.size) ? `<span class="size">${sizeText(n.size)}</span>` : ""}</div>
      <div class="slot-pick">${open ? slotSelect(n) : `<span class="fixed" title="Built into the ship, or nothing else fits">${esc(fixedName)}</span>`}
        ${n.cur ? `<a class="slot-info" href="#${esc(n.cur.id)}" title="Details for ${esc(n.cur.name)}">details</a>` : ""}</div>
      <div class="slot-stat">${slotStat(n)}</div>
      <div class="slot-price">${open ? slotPrice(n) : ""}</div>
      <div class="slot-actions">
        ${n.changed ? `<button type="button" class="mini ghost" data-reset="${esc(n.path)}" title="Put the stock part back">↺ stock</button>` : ""}
        ${canApply ? `<button type="button" class="mini ghost" data-apply-all="${esc(n.path)}" title="Fit this in every ${esc(sizeText(n.size))} slot like it">all ${twins.length}</button>` : ""}
      </div>
    </div>`;
  }

  function groupRow(run, depth) {
    const first = run[0];
    const vals = new Set(run.map((n) => n.curKey || ""));
    const value = vals.size === 1 ? [...vals][0] : "__mixed";
    const anyChanged = run.some((n) => n.changed);
    const shown = run.find((n) => n.cur) || first;
    return `<div class="slot-row d${Math.min(depth, 3)}${anyChanged ? " changed" : ""}">
      <div class="slot-label">${run.length}× ${esc(first.label.replace(/\s*\d+$/, ""))} <span class="size">${sizeText(first.size)}</span></div>
      <div class="slot-pick">${slotSelect(first, { value, list: run.map((n) => n.path) })}
        ${value === "__mixed" ? `<details class="mixed"><summary>Set one by one</summary>${run.map((n) => slotRow(n, depth + 1, new Map())).join("")}</details>` : ""}</div>
      <div class="slot-stat">${value !== "__mixed" ? slotStat(shown) : ""}</div>
      <div class="slot-price">${value !== "__mixed" ? slotPrice(shown) : ""}</div>
      <div class="slot-actions">${anyChanged ? `<button type="button" class="mini ghost" data-reset="${esc(run.map((n) => n.path).join("|"))}">↺ stock</button>` : ""}</div>
    </div>`;
  }

  const shapeKey = (n) => `${n.types.join()}|${sizeText(n.size)}|${n.editable}`;

  // Tag every node with its section, so "apply to all" can stay inside it.
  function tagGroups(tree) {
    for (const top of tree) {
      const g = groupOf(top);
      walk([top], (n) => { n.group = g; });
    }
    return tree;
  }

  function slotsHtml(tree) {
    tagGroups(tree);
    const matches = new Map();
    walk(tree, (n) => {
      if (!n.editable) return;
      const k = n.group + "|" + shapeKey(n);
      matches.set(k, [...(matches.get(k) || []), n]);
    });
    const byGroup = new Map(GROUPS.map(([k]) => [k, []]));
    for (const n of tree) byGroup.get(groupOf(n)).push(n);
    byGroup.get("components").sort((a, b) => componentRank(a) - componentRank(b));
    return GROUPS.map(([k, label]) => {
      const nodes = byGroup.get(k);
      if (!nodes.length) return "";
      return `<section class="slot-group"><h3>${esc(label)}</h3>${rowsHtml(nodes, 0, matches)}</section>`;
    }).join("") || `<p class="empty">This vehicle has no parts you can change.</p>`;
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  function summaryHtml(ship, tree, stockTree) {
    const a = totals(stockTree);
    const b = totals(tree);
    const shop = shopping(tree);
    const changedCount = (() => { let c = 0; walk(tree, (n) => { if (n.changed) c++; }); return c; })();
    const rows = TOTAL_ROWS.filter(([k]) => a[k] || b[k]).map(([k, label, unit, better]) =>
      `<tr><th>${esc(label)}${unit ? ` <small>${esc(unit)}</small>` : ""}</th><td class="num">${fmt(a[k])}</td><td class="num">${fmt(b[k])}</td><td class="num">${diffHtml(a[k], b[k], better)}</td></tr>`
    ).join("");
    const power = b.powerOut ? `<p class="note">Power and coolant draw add every part at full use. In game you share power between systems, so the draw can be higher than the output. A big gap means you'll have to choose what runs at full power.</p>` : "";
    const list = shop.rows.length
      ? `<table class="shop-list"><thead><tr><th>Part</th><th class="num">Need</th><th>Cheapest shop</th><th class="num">aUEC</th></tr></thead><tbody>
          ${shop.rows.map((r) => `<tr>
            <td><a href="#${esc(r.item.id)}">${esc(r.item.name)}</a>${r.owned ? ` <small class="owned-tag">own ${r.owned}</small>` : ""}</td>
            <td class="num">${r.buy}${r.qty !== r.buy ? `<small> of ${r.qty}</small>` : ""}</td>
            <td>${r.buy ? (r.shop ? shopLink(r.shop) : `<span class="muted">Not sold in game</span>`) : `<span class="muted">—</span>`}</td>
            <td class="num">${r.buy && r.cost != null ? fmt(r.cost) : r.buy ? "?" : "0"}</td></tr>`).join("")}
          </tbody></table>`
      : `<p class="muted">No changes yet. Pick parts on the left to see what they cost.</p>`;
    return `
      <div class="cost">
        <span>To buy for this build</span>
        <strong>${fmt(shop.total)} aUEC</strong>
        <small>${changedCount} slot${changedCount === 1 ? "" : "s"} changed${shop.ownedParts ? ` · ${shop.ownedParts} part${shop.ownedParts === 1 ? "" : "s"} you own` : ""}${shop.unpriced.length ? ` · ${shop.unpriced.length} not sold in game` : ""}</small>
      </div>
      <h3>Shopping list</h3>
      ${list}
      <h3>Stock vs this build</h3>
      <table class="totals"><thead><tr><th></th><th class="num">Stock</th><th class="num">Build</th><th class="num">Change</th></tr></thead><tbody>${rows}</tbody></table>
      ${power}`;
  }

  // ── Planner view ───────────────────────────────────────────────────────────
  const currentBuild = () => (state.build ? Builds.get(state.build) : null);
  const picks = () => (currentBuild() || {}).picks || {};

  function pickerHtml() {
    const saved = Object.entries(Builds.all());
    const flyable = ships.filter((s) => s.slots.some((d) => { let e = false; walk([resolve(d, d.p, {}, s.id)], (n) => { if (n.editable) e = true; }); return e; }));
    return `<div class="cmp-card">
      <h3>Pick a ship</h3>
      <p class="muted">Start from its stock loadout, then swap weapons and components. Changes save as a build.</p>
      <input class="ship-search" list="planShips" placeholder="Type a ship name…" data-ship-input aria-label="Ship">
      ${saved.length ? `<h3>Your builds</h3>${buildCards(saved.slice(0, 6))}${saved.length > 6 ? `<p><a href="#builds">All ${saved.length} builds →</a></p>` : ""}` : ""}
      <h3>All ships <small class="muted">${flyable.length}</small></h3>
      <ul class="ship-grid">${flyable.map((s) => `<li><a href="#plan=${esc(s.id)}">${esc(s.name)}</a> <small>${esc(s.manufacturer || "")}</small></li>`).join("")}</ul>
    </div>`;
  }

  function headHtml(ship) {
    const builds = Builds.forShip(ship.id);
    const b = currentBuild();
    return `<div class="cmp-card plan-head">
      <div class="plan-title">
        <div>
          <h2>${esc(ship.name)}</h2>
          <p class="sub">${[ship.manufacturer, ship.career, ship.role].filter(Boolean).map(esc).join(" · ")}
            ${shipsHref ? ` · <a href="${esc(shipsHref)}#${esc(ship.id)}">In the ships app →</a>` : ""}</p>
        </div>
        <label class="ship-switch">Ship <input list="planShips" placeholder="Switch ship…" data-ship-input aria-label="Switch ship"></label>
      </div>
      <div class="build-bar">
        <label>Build
          <select data-build-select aria-label="Build">
            <option value=""${!b ? " selected" : ""}>Stock loadout</option>
            ${builds.map((x) => `<option value="${esc(x.id)}"${x.id === state.build ? " selected" : ""}>${esc(x.name)}</option>`).join("")}
            <option value="__new">New build…</option>
          </select>
        </label>
        ${b ? `<button type="button" class="ghost" data-build-act="rename">Rename</button>
          <button type="button" class="ghost" data-build-act="duplicate">Duplicate</button>
          <button type="button" class="ghost" data-build-act="reset">Reset to stock</button>
          <button type="button" class="ghost danger" data-build-act="delete">Delete</button>` : `<span class="muted">Change any slot and it's saved as a new build.</span>`}
      </div>
      ${b ? `<label class="build-notes">Notes <textarea data-build-notes rows="2" placeholder="What's this build for?">${esc(b.notes || "")}</textarea></label>` : ""}
    </div>`;
  }

  const datalist = () => `<datalist id="planShips">${ships.map((s) => `<option value="${esc(s.name)}"></option>`).join("")}</datalist>`;

  function render(el) {
    const ship = shipById.get(state.ship);
    if (!ship) {
      el.innerHTML = datalist() + pickerHtml();
      return;
    }
    const tree = resolveShip(ship, picks());
    const stockTree = resolveShip(ship, {});
    // Keep the scroll position of the slot list across re-renders.
    const prev = el.querySelector(".plan-slots");
    const scroll = prev ? prev.scrollTop : 0;
    el.innerHTML = `${datalist()}${headHtml(ship)}
      <div class="plan-grid">
        <div class="cmp-card plan-slots">${slotsHtml(tree)}</div>
        <aside class="cmp-card plan-summary">${summaryHtml(ship, tree, stockTree)}</aside>
      </div>
      <p class="note">${published ? "" : "Builds save to this browser right away; save builds.js to keep them. "}Slots and stock parts come from the game data. A part with no menu is built into the ship, or nothing else in the game fits there.</p>`;
    const now = el.querySelector(".plan-slots");
    if (now) now.scrollTop = scroll;
  }

  // ── Editing ────────────────────────────────────────────────────────────────
  function ensureBuild() {
    if (state.build && Builds.get(state.build)) return state.build;
    const ship = shipById.get(state.ship);
    const n = Builds.forShip(ship.id).length + 1;
    state.build = Builds.create(ship.id, `${ship.name} build${n > 1 ? " " + n : ""}`);
    syncHash();
    return state.build;
  }

  function setPicks(paths, value) {
    const ship = shipById.get(state.ship);
    const id = ensureBuild();
    const next = { ...picks() };
    for (const path of paths) {
      next[path] = value;
      // Clear picks inside this slot: its contents depend on what's in it now.
      for (const k of Object.keys(next)) if (k.startsWith(path + "/")) delete next[k];
    }
    // Drop picks that match stock, so a build only lists real changes.
    const stock = new Map();
    walk(resolveShip(ship, {}), (n) => stock.set(n.path, n.stockId || (n.stockName ? "x" : "")));
    for (const [k, v] of Object.entries(next)) if (stock.has(k) && (stock.get(k) || "") === (v || "") && !hasChangedAncestor(k, next)) delete next[k];
    Builds.update(id, { picks: next });
  }
  const hasChangedAncestor = (path, p) => Object.keys(p).some((k) => path.startsWith(k + "/"));

  function resetPaths(paths) {
    const next = { ...picks() };
    for (const path of paths) for (const k of Object.keys(next)) if (k === path || k.startsWith(path + "/")) delete next[k];
    if (state.build) Builds.update(state.build, { picks: next });
  }

  function findNode(path) {
    const ship = shipById.get(state.ship);
    let hit = null;
    walk(tagGroups(resolveShip(ship, picks())), (n) => { if (n.path === path) hit = n; });
    return hit;
  }

  function applyAll(path) {
    const src = findNode(path);
    if (!src) return;
    const ship = shipById.get(state.ship);
    const targets = [];
    walk(tagGroups(resolveShip(ship, picks())), (n) => {
      if (n.editable && n.group === src.group && shapeKey(n) === shapeKey(src) && n.path !== path && (!src.cur || fits(src.cur, n.def, ship.id))) targets.push(n.path);
    });
    setPicks(targets, src.curKey || "");
  }

  function shipFromInput(text) {
    const t = text.trim().toLowerCase();
    return ships.find((s) => s.name.toLowerCase() === t) || null;
  }

  function open(shipId, buildId) {
    const b = buildId ? Builds.get(buildId) : null;
    state.ship = b ? b.ship : shipId;
    state.build = b ? buildId : null;
  }

  function syncHash() {
    const h = state.ship ? `#plan=${encodeURIComponent(state.ship)}${state.build ? "/" + encodeURIComponent(state.build) : ""}` : "#plan";
    try { history.replaceState(null, "", h); } catch (e) { /* file:// in some browsers */ }
  }

  function bind(el) {
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-slot]")) setPicks([t.dataset.slot], t.value);
      else if (t.matches("[data-slots]")) { if (t.value !== "__mixed") setPicks(t.dataset.slots.split("|"), t.value); }
      else if (t.matches("[data-build-select]")) {
        if (t.value === "__new") {
          const name = (prompt("Name the new build:", `${shipById.get(state.ship).name} build`) || "").trim();
          if (name) state.build = Builds.create(state.ship, name, { ...picks() });
        } else state.build = t.value || null;
        syncHash();
        changed();
      } else if (t.matches("[data-build-notes]") && state.build) Builds.update(state.build, { notes: t.value.trim() || undefined });
      else if (t.matches("[data-ship-input]")) pickShip(t);
    });
    // Picking from the datalist fires "input" with insertReplacementText in Chromium.
    el.addEventListener("input", (e) => {
      if (e.target.matches("[data-ship-input]") && (!e.inputType || e.inputType === "insertReplacementText")) pickShip(e.target);
    });
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.reset) resetPaths(btn.dataset.reset.split("|"));
      if (btn.dataset.applyAll) applyAll(btn.dataset.applyAll);
      const act = btn.dataset.buildAct;
      const b = currentBuild();
      if (act && b) {
        if (act === "rename") {
          const name = (prompt("Rename this build:", b.name) || "").trim();
          if (name) Builds.update(state.build, { name });
        }
        if (act === "duplicate") {
          state.build = Builds.create(b.ship, `${b.name} (copy)`, { ...b.picks });
          syncHash();
          changed();
        }
        if (act === "reset" && confirm("Put every slot back to stock?")) Builds.update(state.build, { picks: {} });
        if (act === "delete" && confirm(`Delete the build "${b.name}"?`)) {
          Builds.remove(state.build);
          state.build = null;
          syncHash();
          changed();
        }
      }
      if (btn.dataset.deleteBuild) {
        const x = Builds.get(btn.dataset.deleteBuild);
        if (x && confirm(`Delete the build "${x.name}"?`)) Builds.remove(btn.dataset.deleteBuild);
      }
    });
  }
  function pickShip(input) {
    const s = shipFromInput(input.value);
    if (!s) return;
    input.value = "";
    state.ship = s.id;
    state.build = null;
    syncHash();
    changed();
  }

  // ── My builds ──────────────────────────────────────────────────────────────
  function buildCards(entries) {
    return `<div class="build-cards">${entries.map(([id, b]) => {
      const ship = shipById.get(b.ship);
      if (!ship) return `<div class="build-card"><strong>${esc(b.name)}</strong><p class="muted">Ship "${esc(b.ship)}" isn't in the data any more.</p></div>`;
      const tree = resolveShip(ship, b.picks || {});
      const a = totals(resolveShip(ship, {}));
      const t = totals(tree);
      const shop = shopping(tree);
      let n = 0;
      walk(tree, (x) => { if (x.changed) n++; });
      const stat = (k, label, better = "high") => (a[k] || t[k] ? `<span>${label} ${fmt(t[k])} ${diffHtml(a[k], t[k], better)}</span>` : "");
      return `<div class="build-card">
        <div><a href="#plan=${esc(ship.id)}/${esc(id)}"><strong>${esc(b.name)}</strong></a>
          <p class="sub">${esc(ship.name)} · ${n} change${n === 1 ? "" : "s"} · updated ${esc(b.updated || b.created || "")}</p></div>
        <div class="build-stats">${stat("pilotDps", "DPS")}${stat("shieldHp", "Shields")}${stat("qtSpeed", "QT")}${stat("minePower", "Mining")}</div>
        <div class="build-cost"><strong>${fmt(shop.total)} aUEC</strong> <small>to buy${shop.unpriced.length ? ` · ${shop.unpriced.length} not sold` : ""}</small></div>
        ${b.notes ? `<p class="build-note">${esc(b.notes)}</p>` : ""}
        <div class="build-actions"><a class="button-link" href="#plan=${esc(ship.id)}/${esc(id)}">Open</a>
          <button type="button" class="mini ghost danger" data-delete-build="${esc(id)}">Delete</button></div>
      </div>`;
    }).join("")}</div>`;
  }

  function renderBuilds(el) {
    const entries = Object.entries(Builds.all()).sort(([, a], [, b]) => (b.updated || "").localeCompare(a.updated || ""));
    el.innerHTML = `<div class="cmp-card">
      <h3>My builds</h3>
      ${entries.length ? buildCards(entries) : `<p class="muted">No builds yet. Open the <a href="#plan">Loadout planner</a>, pick a ship and change a slot.</p>`}
      ${!published && entries.length ? `<p class="note">Builds live in builds.js. Changes made here stay in this browser until you save builds.js over the one in this folder.</p>` : ""}
    </div>`;
  }

  // Ships whose stock loadout has this item, and ships with a slot it fits (for the catalog).
  function shipsFor(item) {
    const stock = [], fit = [];
    for (const ship of ships) {
      let isStock = false, isFit = false;
      walk(resolveShip(ship, {}), (n) => {
        if (n.stockId === item.id) isStock = true;
        if (n.editable && fits(item, n.def, ship.id)) isFit = true;
      });
      if (isStock) stock.push(ship);
      else if (isFit) fit.push(ship);
    }
    return { stock, fit };
  }

  window.Planner = {
    state, open, render, renderBuilds, bind, syncHash, shipsFor, totals, resolveShip,
    onChange: (fn) => changeListeners.push(fn),
  };
})();
