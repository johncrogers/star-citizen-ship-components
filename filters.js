// Search filters for the ship components viewer.
//
// The search box is the single source of truth. Plain words match anywhere (name, maker,
// description, shop locations...). Structured terms filter on a quality:
//   dps>=1000  price<50k  type:cooler  size:2  grade:a  loc:(pyro)  is:buyable  ship:cutlass
// The Filters panel just writes these terms into the search box, so typing and clicking stay in sync.
(function () {
  const { esc, fmt, availability, availabilityLabel, bestPrice, Owned, Wishlist, shipById } = window.Parts;

  // ── Qualities ──────────────────────────────────────────────────────────────
  // Numeric getters return a number, or null when unknown. Items with an unknown value never
  // match a numeric filter.
  const stat = (k) => (s) => (s.stats[k] != null && s.stats[k] !== "" ? s.stats[k] : null);

  const NUMERIC = [
    { key: "price", aliases: ["cost", "auec", "buy"], label: "Price", unit: "aUEC", get: bestPrice, panel: true },
    { key: "size", aliases: ["s"], label: "Size", unit: "", get: stat("size"), panel: true },
    { key: "dps", aliases: [], label: "DPS", unit: "", get: stat("dps"), panel: true },
    { key: "sustained", aliases: ["sdps"], label: "Sustained DPS", unit: "", get: stat("sustained") },
    { key: "alpha", aliases: ["pershot"], label: "Damage per shot", unit: "", get: stat("alpha"), panel: true },
    { key: "rpm", aliases: ["firerate", "rof"], label: "Fire rate", unit: "rpm", get: stat("rpm") },
    { key: "range", aliases: [], label: "Range", unit: "m", get: stat("rangeM"), panel: true },
    { key: "velocity", aliases: ["speed"], label: "Speed", unit: "m/s", get: stat("speed") },
    { key: "shield", aliases: ["shieldhp"], label: "Shield HP", unit: "", get: stat("shieldHp"), panel: true },
    { key: "regen", aliases: [], label: "Shield regen", unit: "HP/s", get: stat("shieldRegen"), panel: true },
    { key: "output", aliases: ["powerout"], label: "Power output", unit: "segments", get: stat("powerOut"), panel: true },
    { key: "cooling", aliases: ["coolout"], label: "Cooling", unit: "segments", get: stat("coolOut"), panel: true },
    { key: "draw", aliases: ["power"], label: "Power draw", unit: "segments", get: stat("power") },
    { key: "qt", aliases: ["quantum", "qtspeed"], label: "Quantum speed", unit: "Mm/s", get: stat("qtSpeed"), panel: true },
    { key: "spool", aliases: [], label: "Spool time", unit: "s", get: stat("spool"), panel: true },
    { key: "damage", aliases: ["dmg"], label: "Missile damage", unit: "", get: stat("damage"), panel: true },
    { key: "lock", aliases: ["locktime"], label: "Lock time", unit: "s", get: stat("lockTime") },
    { key: "missiles", aliases: ["holds"], label: "Rack holds", unit: "", get: stat("missiles") },
    { key: "mining", aliases: ["minepower", "laser"], label: "Laser power", unit: "", get: stat("minePower"), panel: true },
    { key: "modules", aliases: ["moduleslots"], label: "Module slots", unit: "", get: stat("moduleSlots") },
    { key: "force", aliases: ["tractor"], label: "Tractor force", unit: "kN", get: stat("force") },
    { key: "em", aliases: [], label: "EM signature", unit: "", get: stat("em") },
    { key: "ir", aliases: [], label: "IR signature", unit: "", get: stat("ir") },
    { key: "hp", aliases: ["durability", "health"], label: "Durability", unit: "HP", get: stat("hp") },
  ];

  const allLocations = (s) => s.buy.map((x) => x.location).join(" | ");
  const shipNames = (s) => (s.ships || []).map((id) => (shipById.get(id) || {}).name || id).join(" | ");
  const TEXT = [
    { key: "maker", aliases: ["manufacturer", "manu", "brand", "mfr"], label: "Maker", get: (s) => s.manufacturer },
    { key: "cat", aliases: ["category", "kind"], label: "Category", get: (s) => s.category },
    { key: "type", aliases: ["slot"], label: "Type", get: (s) => s.type },
    { key: "grade", aliases: [], label: "Grade", get: (s) => s.grade, exact: true },
    { key: "class", aliases: ["focus"], label: "Class", get: (s) => s.class },
    { key: "damagetype", aliases: ["dmgtype"], label: "Damage type", get: (s) => s.damage },
    { key: "ship", aliases: ["fits"], label: "Paint for", get: shipNames },
    { key: "loc", aliases: ["location", "shop", "at", "system"], label: "Sold at", get: allLocations },
    { key: "group", aliases: ["wishlist"], label: "Wishlist group", get: (s) => (Wishlist.isWanted(s.id) ? Wishlist.group(s.id) : "") },
    { key: "avail", aliases: ["availability", "get"], label: "Availability", get: (s) => `${availability(s)} ${availabilityLabel[availability(s)]}` },
    { key: "event", aliases: [], label: "Event", get: (s) => s.event },
    { key: "name", aliases: [], label: "Name", get: (s) => s.name },
    // UEX terminal code of a shop, e.g. code:PBAL1. The locations app links here with it.
    { key: "code", aliases: ["terminal"], label: "Sold at shop", get: (s) => s.buy.map((b) => b.code).filter(Boolean), list: true },
  ];

  // is:/has: flags. Each maps to a test.
  const FLAGS = {
    buyable: { label: "Sold in shops", test: (s) => s.buy.length > 0, aliases: ["buy", "sold", "shop"] },
    loot: { label: "Can be looted", test: (s) => !!s.loot, aliases: ["lootable", "looted"] },
    craft: { label: "Craftable", test: (s) => !!s.craft, aliases: ["craftable", "crafted"] },
    event: { label: "Event item", test: (s) => !!s.event },
    weapon: { label: "Weapon", test: (s) => s.category === "Weapons", aliases: ["weapons", "gun"] },
    component: { label: "Component", test: (s) => s.category === "Components", aliases: ["components"] },
    missile: { label: "Missile or bomb", test: (s) => s.category === "Missiles & bombs", aliases: ["missiles", "bomb"] },
    mining: { label: "Mining or salvage", test: (s) => s.category === "Mining & salvage", aliases: ["salvage"] },
    paint: { label: "Paint or flair", test: (s) => s.category === "Paints & flair", aliases: ["paints", "flair"] },
    wanted: { label: "On my wishlist", test: (s) => Wishlist.isWanted(s.id), aliases: ["wishlist", "wish"] },
    owned: { label: "Owned", test: (s) => Owned.isOwned(s.id), aliases: ["have"] },
    researched: { label: "Has my notes", test: (s) => !!s.curated, aliases: ["curated", "notes"] },
    image: { label: "Has a picture", test: (s) => !!s.image, aliases: ["picture", "photo"] },
  };

  const byName = new Map();
  for (const f of NUMERIC) [f.key, ...f.aliases].forEach((k) => byName.set(k, { ...f, kind: "num", key: f.key }));
  for (const f of TEXT) [f.key, ...f.aliases].forEach((k) => byName.set(k, { ...f, kind: "text", key: f.key }));
  const flagByName = new Map();
  for (const [k, f] of Object.entries(FLAGS)) [k, ...(f.aliases || [])].forEach((a) => flagByName.set(a, { ...f, key: k }));

  // ── Parsing ────────────────────────────────────────────────────────────────
  // "2m" → 2000000, "500k" → 500000, "1,250" → 1250, "-40" → -40
  function parseNum(v) {
    const m = String(v).trim().toLowerCase().replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)([km]?)$/);
    if (!m) return null;
    return +m[1] * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
  }
  const unquote = (v) => v.replace(/^"(.*)"$/, "$1");

  function tokenize(q) {
    return q.match(/-?[^\s"]*"[^"]*"?|\S+/g) || [];
  }

  // Each term → { raw, neg, kind: "num"|"text"|"flag"|"free", field, op, value, lo, hi }
  function parseTerm(raw) {
    let t = raw;
    const neg = t.startsWith("-") && t.length > 1 && !/^-\d/.test(t);
    if (neg) t = t.slice(1);
    const m = t.match(/^([a-z][a-z-]*)(>=|<=|>|<|=|:)(.+)$/i);
    if (m) {
      const name = m[1].toLowerCase();
      const op = m[2];
      const value = unquote(m[3]);
      if ((name === "is" || name === "has") && op === ":") {
        const flag = flagByName.get(value.toLowerCase());
        if (flag) return { raw, neg, kind: "flag", field: flag, value: flag.key };
      }
      const field = byName.get(name);
      if (field && field.kind === "num") {
        const range = value.match(/^(-?\d[\d,]*(?:\.\d+)?[km]?)(?:\.\.|-)(-?\d[\d,]*(?:\.\d+)?[km]?)$/i);
        if (range && (op === ":" || op === "=")) {
          const lo = parseNum(range[1]);
          const hi = parseNum(range[2]);
          if (lo != null && hi != null) return { raw, neg, kind: "num", field, op: "range", lo, hi };
        }
        const n = parseNum(value);
        if (n != null) return { raw, neg, kind: "num", field, op: op === ":" ? "=" : op, lo: n, hi: n };
      }
      if (field && field.kind === "text" && (op === ":" || op === "=")) {
        return { raw, neg, kind: "text", field, op, value: value.toLowerCase() };
      }
    }
    return { raw, neg, kind: "free", value: unquote(t).toLowerCase() };
  }

  const parse = (q) => tokenize(q).map(parseTerm).filter((t) => t.kind !== "free" || t.value);

  function testNum(t, s) {
    const v = t.field.get(s);
    if (v == null) return false;
    switch (t.op) {
      case ">=": return v >= t.lo;
      case ">": return v > t.lo;
      case "<=": return v <= t.lo;
      case "<": return v < t.lo;
      case "=": return v === t.lo;
      case "range": return v >= t.lo && v <= t.hi;
    }
    return false;
  }

  function testTerm(t, s, haystack) {
    let ok;
    if (t.kind === "num") ok = testNum(t, s);
    else if (t.kind === "flag") ok = t.field.test(s);
    else if (t.kind === "text") {
      if (t.field.list) ok = t.field.get(s).some((x) => x.toLowerCase() === t.value);
      else {
        const v = String(t.field.get(s) || "").toLowerCase();
        ok = t.field.exact ? v === t.value : v.includes(t.value);
      }
    } else ok = haystack.includes(t.value);
    return t.neg ? !ok : ok;
  }

  const matches = (terms, s, haystack) => {
    const codes = terms.filter((t) => t.kind === "text" && t.field.key === "code" && !t.neg);
    const rest = codes.length > 1 ? terms.filter((t) => !codes.includes(t)) : terms;
    return (codes.length < 2 || codes.some((t) => testTerm(t, s, haystack))) && rest.every((t) => testTerm(t, s, haystack));
  };

  // ── Editing the query from the panel ───────────────────────────────────────
  const quote = (v) => (/\s/.test(v) ? `"${v}"` : v);
  const shortNum = (n) => (n >= 1e6 && n % 1e5 === 0 ? `${n / 1e6}m` : n >= 1e3 && n % 100 === 0 ? `${n / 1e3}k` : String(n));

  // Replace the terms that `isMine` picks out with `newTerms`, keeping everything else.
  function rewrite(q, isMine, newTerms) {
    const kept = tokenize(q).filter((raw) => !isMine(parseTerm(raw)));
    return [...kept, ...newTerms.filter(Boolean)].join(" ").trim();
  }
  const setText = (q, key, value) =>
    rewrite(q, (t) => t.kind === "text" && t.field.key === key && !t.neg, [value ? `${key}:${quote(value)}` : ""]);
  const setFlag = (q, key, on) => rewrite(q, (t) => t.kind === "flag" && t.field.key === key && !t.neg, [on ? `is:${key}` : ""]);
  const setBound = (q, key, side, value) => {
    const n = parseNum(value);
    const own = (t) => t.kind === "num" && t.field.key === key && !t.neg;
    // A "dps:200-300" range term holds both bounds: split it so the other side survives.
    const range = parse(q).find((t) => own(t) && t.op === "range");
    const keep = range ? (side === "min" ? `${key}<=${shortNum(range.hi)}` : `${key}>=${shortNum(range.lo)}`) : "";
    const mine = (t) => own(t) && (t.op === "range" || (side === "min" ? [">=", ">"] : ["<=", "<"]).includes(t.op));
    return rewrite(q, mine, [keep, n != null ? `${key}${side === "min" ? ">=" : "<="}${shortNum(n)}` : ""]);
  };
  const removeTerm = (q, raw) => {
    const toks = tokenize(q);
    const i = toks.indexOf(raw);
    if (i >= 0) toks.splice(i, 1);
    return toks.join(" ");
  };

  // ── Labels ─────────────────────────────────────────────────────────────────
  const OPS = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=" };
  function termLabel(t) {
    const not = t.neg ? "not " : "";
    if (t.kind === "flag") return t.neg ? `not ${t.field.label.replace(/^./, (c) => c.toLowerCase())}` : t.field.label;
    if (t.kind === "text") {
      const system = t.field.key === "loc" && t.value.match(/^\((.+)\)$/);
      if (system) return `${not}Sold in ${system[1].replace(/^./, (c) => c.toUpperCase())}`;
      return `${t.field.label}: ${not}${t.value}`;
    }
    if (t.kind === "num") {
      const u = t.field.unit ? ` ${t.field.unit}` : "";
      const v = t.op === "range" ? `${fmt(t.lo)}–${fmt(t.hi)}` : `${OPS[t.op]} ${fmt(t.lo)}`;
      return `${not}${t.field.label} ${v}${u}`;
    }
    return `${not}“${t.value}”`;
  }

  // Numeric fields the query filters on (the list shows these values on each row).
  const numericKeys = (terms) => [...new Set(terms.filter((t) => t.kind === "num").map((t) => t.field.key))];
  const numField = (key) => NUMERIC.find((f) => f.key === key);
  function formatValue(field, s) {
    const v = field.get(s);
    if (v == null) return null;
    return `${field.label} ${fmt(v)}${field.unit ? " " + field.unit : ""}`;
  }

  // ── Panel ──────────────────────────────────────────────────────────────────
  const SELECTS = [
    { key: "cat", label: "Category", values: (items) => items.map((s) => s.category) },
    { key: "type", label: "Type", values: (items) => items.map((s) => s.type) },
    { key: "grade", label: "Grade", values: (items) => items.map((s) => s.grade).filter(Boolean) },
    { key: "class", label: "Class", values: (items) => items.map((s) => s.class).filter(Boolean) },
    { key: "maker", label: "Maker", values: (items) => items.map((s) => s.manufacturer) },
    // Shop locations end in "(System)", so match on that to avoid "Pyro Gateway (Stanton)".
    { key: "loc", label: "Sold in", options: [["(stanton)", "Stanton"], ["(pyro)", "Pyro"], ["(nyx)", "Nyx"]] },
  ];
  const PANEL_FLAGS = ["buyable", "loot", "craft", "event", "image", "researched"];

  const EXAMPLES = [
    ["Size 3 guns, best DPS first", "type:\"laser repeater\" size:3 is:buyable"],
    ["Grade A size 2 coolers", "type:cooler size:2 grade:a"],
    ["Stealth components", "cat:components class:stealth"],
    ["Fast quantum drives", "type:\"quantum drive\" qt>=200"],
    ["Mining lasers sold in Pyro", "type:\"mining laser\" loc:(pyro)"],
    ["Paints for the Cutlass", "type:paint ship:cutlass"],
  ];

  function renderPanel(el, items, q) {
    const terms = parse(q);
    const textVal = (key) => (terms.find((t) => t.kind === "text" && t.field.key === key && !t.neg) || {}).value || "";
    const bound = (key, side) => {
      const t = terms.find(
        (t) => t.kind === "num" && t.field.key === key && !t.neg && (side === "min" ? [">=", ">", "range"] : ["<=", "<", "range"]).includes(t.op)
      );
      return t ? shortNum(t.op === "range" ? (side === "min" ? t.lo : t.hi) : t.lo) : "";
    };
    const flagOn = (key) => terms.some((t) => t.kind === "flag" && t.field.key === key && !t.neg);

    const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b));
    // Narrow the Type menu to the chosen category so it stays short.
    const cat = textVal("cat");
    const pool = cat ? items.filter((s) => s.category.toLowerCase().includes(cat)) : items;
    const extent = (f) => {
      let lo = Infinity, hi = -Infinity;
      for (const s of pool) {
        const v = f.get(s);
        if (v == null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return lo <= hi ? [lo, hi] : null;
    };

    el.innerHTML = `
      <div class="fp-section fp-selects">
        ${SELECTS.map((sel) => {
          const cur = textVal(sel.key);
          const opts = sel.options || uniq(sel.values(sel.key === "cat" ? items : pool)).map((o) => [o, o]);
          const known = opts.some(([v]) => v.toLowerCase() === cur);
          return `<label><span>${sel.label}</span>
            <select data-fp-text="${sel.key}">
              <option value="">Any</option>
              ${opts.map(([v, l]) => `<option value="${esc(v)}"${v.toLowerCase() === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}
              ${cur && !known ? `<option selected value="${esc(cur)}">${esc(cur)}</option>` : ""}
            </select></label>`;
        }).join("")}
      </div>
      <div class="fp-section fp-flags">
        ${PANEL_FLAGS.map((k) => `<label class="fp-flag"><input type="checkbox" data-fp-flag="${k}"${flagOn(k) ? " checked" : ""}> ${esc(FLAGS[k].label)}</label>`).join("")}
      </div>
      <div class="fp-section fp-ranges">
        ${NUMERIC.filter((f) => f.panel).map((f) => {
          const ext = extent(f);
          if (!ext) return "";
          const ph = [shortNum(Math.floor(ext[0])), shortNum(Math.ceil(ext[1]))];
          return `<div class="fp-range">
            <span>${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ""}</span>
            <input inputmode="decimal" data-fp-num="${f.key}" data-side="min" value="${esc(bound(f.key, "min"))}" placeholder="${esc(ph[0])}" aria-label="${esc(f.label)} minimum">
            <em>–</em>
            <input inputmode="decimal" data-fp-num="${f.key}" data-side="max" value="${esc(bound(f.key, "max"))}" placeholder="${esc(ph[1])}" aria-label="${esc(f.label)} maximum">
          </div>`;
        }).join("")}
      </div>
      <details class="fp-help">
        <summary>Type filters into the search box</summary>
        <p>Plain words match anywhere. Add terms to filter on a quality. Prefix any term with <code>-</code> to exclude. Numbers take <code>k</code> and <code>m</code> (<code>50k</code>). Parts with no data for a number are left out when you filter on it.</p>
        <table class="fp-syntax">
          <tr><td><code>dps&gt;=1000</code> <code>price&lt;50k</code> <code>size:2-3</code></td><td>Numbers: ${NUMERIC.map((f) => `<code>${f.key}</code>`).join(" ")}</td></tr>
          <tr><td><code>type:cooler</code> <code>loc:"area 18"</code></td><td>Text: ${TEXT.map((f) => `<code>${f.key}</code>`).join(" ")}</td></tr>
          <tr><td><code>is:buyable</code> <code>-is:loot</code></td><td>Flags: ${Object.keys(FLAGS).map((k) => `<code>${k}</code>`).join(" ")}</td></tr>
        </table>
        <p>Try: ${EXAMPLES.map(([label, ex]) => `<button type="button" class="ghost fp-example" data-fp-example="${esc(ex)}" title="${esc(ex)}">${esc(label)}</button>`).join(" ")}</p>
      </details>
    `;
  }

  // Wire the panel: every control change produces a new query string.
  function bindPanel(el, getQuery, setQuery) {
    el.addEventListener("change", (e) => {
      const t = e.target;
      const q = getQuery();
      if (t.dataset.fpText) setQuery(setText(q, t.dataset.fpText, t.value));
      else if (t.dataset.fpFlag) setQuery(setFlag(q, t.dataset.fpFlag, t.checked));
      else if (t.dataset.fpNum) setQuery(setBound(q, t.dataset.fpNum, t.dataset.side, t.value));
    });
    el.addEventListener("click", (e) => {
      const ex = e.target.closest("[data-fp-example]");
      if (!ex) return;
      ex.blur(); // let the panel re-render to show the example's values
      setQuery(ex.dataset.fpExample);
    });
  }

  window.PartFilters = {
    parse, matches, termLabel, removeTerm, renderPanel, bindPanel,
    numericKeys, numField, formatValue, NUMERIC,
  };
})();
