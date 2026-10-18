// Shared helpers for the ship components viewer: item and ship records, slot matching, and the
// wishlist, owned and saved-build stores.
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  // On the public site (see site.js), visitors can't save files into this repo.
  const published = (window.SITE || {}).mode === "published";
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const siteLink = (id) => ((window.SITE || {}).links || []).find((l) => l.id === id)?.href || null;

  // ── Items ──────────────────────────────────────────────────────────────────
  // catalog.data.js (generated) stores some fields in short form (see its header). Expand them.
  const LOCS = window.COMPONENT_LOCATIONS || [];
  const DESCS = window.COMPONENT_DESCRIPTIONS || [];
  const CODES = window.COMPONENT_LOCATION_CODES || [];
  const longDate = (d) => (d ? `20${String(d).slice(0, 2)}-${String(d).slice(2, 4)}-${String(d).slice(4, 6)}` : null);
  function longImage(img) {
    if (!img) return null;
    if (img.startsWith("w:")) {
      const path = img.slice(2);
      return `https://media.starcitizen.tools/thumb/${path}/600px-${path.split("/").pop()}.webp`;
    }
    return img;
  }
  function expand(r) {
    const { cstone, uex, ...rest } = r;
    return {
      ...rest,
      stats: r.stats || {},
      facts: r.facts || [],
      slots: r.slots || [],
      buy: (r.buy || []).map(([loc, price, date, src]) => ({
        location: LOCS[loc],
        code: CODES[loc] || null,
        price,
        date: longDate(date),
        source: src === "c" ? "cstone" : "UEX",
      })),
      image: longImage(r.image),
      links: {
        cstone: cstone ? `https://finder.cstone.space/${cstone}` : null,
        uex: uex ? `https://uexcorp.space/items/info?name=${encodeURIComponent(uex)}` : null,
        wiki: `https://starcitizen.tools/Special:Search?search=${encodeURIComponent(r.name)}`,
      },
      description: typeof r.description === "number" ? DESCS[r.description] : r.description || "",
    };
  }

  // components.data.js has my curated records, which override catalog records field by field.
  // Matched by className, then by id.
  function mergeItems(catalog, curated) {
    const byClass = new Map(catalog.filter((s) => s.className).map((s) => [s.className.toLowerCase(), s]));
    const byId = new Map(catalog.map((s) => [s.id, s]));
    const replaced = new Map();
    const extra = [];
    for (const cur of curated) {
      const base = (cur.className && byClass.get(cur.className.toLowerCase())) || byId.get(cur.id);
      const merged = base
        ? { ...base, ...cur, stats: { ...base.stats, ...cur.stats }, links: { ...base.links, ...cur.links }, buy: cur.buy || base.buy, curated: true }
        : { stats: {}, facts: [], slots: [], links: {}, buy: [], category: "Other", type: "Other", ...cur, curated: true };
      if (base) replaced.set(base, merged);
      else extra.push(merged);
    }
    return [...catalog.map((s) => replaced.get(s) || s), ...extra];
  }
  const items = mergeItems((window.COMPONENT_CATALOG || []).map(expand), window.COMPONENTS || []);
  const itemById = new Map(items.map((s) => [s.id, s]));

  const ships = window.SHIP_LOADOUTS || [];
  const shipById = new Map(ships.map((s) => [s.id, s]));

  const availability = (s) => {
    if (s.buy.length) return "buy";
    if (s.loot) return "loot";
    if (s.craft) return "craft";
    if (s.event) return "event";
    return "none";
  };
  const availabilityLabel = { buy: "In shops", loot: "Loot only", craft: "Crafted", event: "Event reward", none: "Not sold in game" };
  const bestPrice = (s) => (s && s.buy.length ? Math.min(...s.buy.map((b) => b.price)) : null);
  const cheapest = (s) => (s && s.buy.length ? s.buy.reduce((a, b) => (b.price < a.price ? b : a)) : null);

  // ── Slots ──────────────────────────────────────────────────────────────────
  // A slot lists the item kinds it takes ("WeaponGun.Gun", or just "Shield" for any shield) and a
  // size range. Paint slots are matched by ship instead (a paint lists the ships it fits).
  function fits(item, slot, shipId) {
    if (!item || !item.kind) return false;
    // Types must match. Sub-types must match too, unless either side leaves it out
    // (a "QuantumDrive.QDrive" slot takes a plain "QuantumDrive").
    const [type, sub] = item.kind.split(".");
    const ok = slot.t.some((t) => {
      const [st, ss] = t.split(".");
      return st === type && (!ss || !sub || ss === sub);
    });
    if (!ok) return false;
    if (type === "Paints") return !shipId || (item.ships || []).includes(shipId);
    const size = item.stats.size || 0;
    const [lo, hi] = slot.s || [0, 0];
    return !(lo || hi) || (size >= lo && size <= hi);
  }
  // Every catalog item that fits a slot, grouped by kind once so this stays quick.
  const byType = new Map();
  for (const s of items) {
    if (!s.kind) continue;
    const t = s.kind.split(".")[0];
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(s);
  }
  const candidates = (slot, shipId) => {
    const types = new Set(slot.t.map((t) => t.split(".")[0]));
    return [...types].flatMap((t) => byType.get(t) || []).filter((s) => fits(s, slot, shipId));
  };

  // ── File-backed stores ─────────────────────────────────────────────────────
  // A .js file (e.g. owned.js → window.OWNED) is the saved state. Changes made in the viewer are
  // kept in localStorage as overrides until the user saves a new file over the old one.
  const allStores = [];
  const listeners = [];
  const notify = () => listeners.forEach((fn) => fn());

  function createStore({ key, globalName, fileName, label, header, order }) {
    const fileState = window[globalName] || {};
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { overrides = {}; }
    const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

    function persist() {
      for (const id of Object.keys(overrides)) {
        if (same(overrides[id], fileState[id])) delete overrides[id];
      }
      try { localStorage.setItem(key, JSON.stringify(overrides)); } catch (e) { /* storage unavailable */ }
    }
    persist();

    function all() {
      const out = { ...fileState };
      for (const [id, v] of Object.entries(overrides)) {
        if (v) out[id] = v;
        else delete out[id];
      }
      return out;
    }

    function fileText() {
      const entries = order ? order(Object.entries(all())) : Object.entries(all()).sort(([a], [b]) => a.localeCompare(b));
      // One line per entry: "id": { "key": value, ... }
      const obj = (v) => `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(", ")} }`;
      const body = entries.length
        ? `{\n${entries.map(([id, v]) => `  ${JSON.stringify(id)}: ${obj(v)}`).join(",\n")}\n}`
        : "{}";
      return [...header, `window.${globalName} = ${body};`, ``].join("\n");
    }

    const store = {
      label,
      fileName,
      all,
      get: (id) => all()[id] || null,
      has: (id) => !!all()[id],
      set(id, value) {
        overrides[id] = value || null;
        persist();
        notify();
      },
      pending: () => Object.keys(overrides),
      discard() {
        overrides = {};
        persist();
        notify();
      },
      // Writes the file in place via the File System Access API when available (Edge/Chrome),
      // otherwise downloads it.
      async save() {
        const text = fileText();
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              id: "ship-components",
              suggestedName: fileName,
              types: [{ description: "JavaScript", accept: { "text/javascript": [".js"] } }],
            });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            return "saved";
          } catch (e) {
            if (e.name === "AbortError") return "cancelled";
          }
        }
        const a = Object.assign(document.createElement("a"), {
          href: URL.createObjectURL(new Blob([text], { type: "text/javascript" })),
          download: fileName,
        });
        a.click();
        URL.revokeObjectURL(a.href);
        return "downloaded";
      },
    };
    allStores.push(store);
    return store;
  }

  // ── Owned ──────────────────────────────────────────────────────────────────
  const ownedStore = createStore({
    key: "sc-ship-components:owned-overrides",
    globalName: "OWNED",
    fileName: "owned.js",
    label: "owned",
    header: [
      `// Ship parts I own: { "<item id>": { date: "YYYY-MM-DD", count?: n } }.`,
      `// The viewer's "Owned" checkboxes save to the browser right away. To make them permanent`,
      `// (and visible to agents and git), click "Save owned.js" in the viewer and replace this file.`,
    ],
  });
  const Owned = {
    ...ownedStore,
    isOwned: ownedStore.has,
    count: (id) => (ownedStore.get(id) ? ownedStore.get(id).count || 1 : 0),
    set: (id, owned) => ownedStore.set(id, owned ? { date: (ownedStore.get(id) || {}).date || today() } : null),
    setCount(id, n) {
      const cur = ownedStore.get(id);
      if (n <= 0) return ownedStore.set(id, null);
      ownedStore.set(id, { date: (cur || {}).date || today(), ...(n > 1 ? { count: n } : {}) });
    },
  };

  // ── Wishlist ───────────────────────────────────────────────────────────────
  const groupsOf = (entries) => [...new Set(entries.map(([, v]) => v.group || "Other"))];
  const wishStore = createStore({
    key: "sc-ship-components:wishlist-overrides",
    globalName: "WISHLIST",
    fileName: "wishlist.js",
    label: "wishlist",
    header: [
      `// My ship parts wishlist: { "<item id>": { group, added: "YYYY-MM-DD" } }. Groups show in file order.`,
      `// The viewer's ☆ buttons save to the browser right away. To make changes permanent (and visible`,
      `// to agents and git), click "Save wishlist.js" in the viewer and replace this file.`,
    ],
    order: (entries) => {
      const groups = groupsOf(entries);
      return entries
        .map((e, i) => [e, i])
        .sort(([a, i], [b, j]) => groups.indexOf(a[1].group || "Other") - groups.indexOf(b[1].group || "Other") || i - j)
        .map(([e]) => e);
    },
  });
  const Wishlist = {
    ...wishStore,
    isWanted: wishStore.has,
    group: (id) => (wishStore.get(id) || {}).group || "Other",
    groups: () => groupsOf(Object.entries(wishStore.all())),
    add: (id, group) => wishStore.set(id, { group, added: (wishStore.get(id) || {}).added || today() }),
    remove: (id) => wishStore.set(id, null),
  };

  // ── Saved builds ───────────────────────────────────────────────────────────
  // { "<build id>": { ship, name, notes?, created, updated, picks: { "<slot path>": "<item id>" | "" } } }
  // A slot path is the port names from the ship down, joined by "/". "" means the slot is emptied.
  const buildStore = createStore({
    key: "sc-ship-components:builds-overrides",
    globalName: "BUILDS",
    fileName: "builds.js",
    label: "build",
    header: [
      `// My saved loadouts: { "<build id>": { ship, name, notes?, created, updated, picks } }.`,
      `// picks maps a slot path (port names joined by "/") to the item id fitted there, or "" for empty.`,
      `// Slots not listed keep the ship's stock part. The planner saves to the browser right away; click`,
      `// "Save builds.js" in the viewer and replace this file to make changes permanent.`,
    ],
    order: (entries) => entries.sort(([, a], [, b]) => (a.ship || "").localeCompare(b.ship || "") || (a.created || "").localeCompare(b.created || "")),
  });
  const Builds = {
    ...buildStore,
    forShip: (shipId) => Object.entries(buildStore.all()).filter(([, b]) => b.ship === shipId).map(([id, b]) => ({ id, ...b })),
    create(shipId, name, picks = {}) {
      const id = `${shipId}-${Date.now().toString(36)}`;
      buildStore.set(id, { ship: shipId, name, created: today(), updated: today(), picks });
      return id;
    },
    update(id, patch) {
      const cur = buildStore.get(id);
      if (cur) buildStore.set(id, { ...cur, ...patch, updated: today() });
    },
    remove: (id) => buildStore.set(id, null),
  };

  const onChange = (fn) => listeners.push(fn);

  // Banner shown while browser state differs from the saved files.
  function renderPendingBanner(el) {
    if (published) {
      el.hidden = true; // visitors' changes simply live in their browser
      return;
    }
    const changed = allStores.filter((s) => s.pending().length);
    el.hidden = changed.length === 0;
    if (!changed.length) return;
    const desc = changed
      .map((s) => `${s.pending().length} ${s.label} change${s.pending().length > 1 ? "s" : ""}`)
      .join(" and ");
    el.innerHTML = `
      <span><strong>${desc}</strong> saved in this browser only.
      To keep them for good, save ${changed.map((s) => s.fileName).join(" and ")} over the one${changed.length > 1 ? "s" : ""} in this folder.</span>
      <span class="pending-actions">
        ${changed.map((s) => `<button type="button" data-save="${esc(s.fileName)}">Save ${esc(s.fileName)}</button>`).join("")}
        <button type="button" data-act="discard" class="ghost">Discard</button>
      </span>
      <span class="pending-msg" aria-live="polite"></span>`;
    el.onclick = async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.act === "discard" && confirm(`Discard changes that aren't in ${changed.map((s) => s.fileName).join(" or ")}?`)) {
        changed.forEach((s) => s.discard());
      }
      const store = allStores.find((s) => s.fileName === btn.dataset.save);
      if (store) {
        const result = await store.save();
        const msg = el.querySelector(".pending-msg");
        if (result === "saved") msg.textContent = "Saved. Reload the page to confirm.";
        if (result === "downloaded") msg.textContent = `Downloaded. Move it into this folder, replacing the old ${store.fileName}, then reload.`;
      }
    };
  }

  function ownedToggle(id) {
    const p = Owned.get(id);
    return `<label class="purchase-toggle${p ? " on" : ""}">
      <input type="checkbox" data-owned="${esc(id)}"${p ? " checked" : ""}>
      <span>${p ? `Owned <small>${esc(p.date || "")}</small>` : "Mark owned"}</span>
    </label>${p ? `<label class="count-toggle">How many <input type="number" min="1" max="99" value="${Owned.count(id)}" data-owned-count="${esc(id)}" aria-label="How many you own"></label>` : ""}`;
  }

  function wishlistControl(item) {
    if (!Wishlist.isWanted(item.id)) {
      return `<button type="button" class="wish-toggle" data-wish="${esc(item.id)}">☆ Add to wishlist</button>`;
    }
    const current = Wishlist.group(item.id);
    const options = [...new Set([...Wishlist.groups(), current, item.category])];
    return `<span class="wish-toggle on">
      <button type="button" class="star on" data-wish="${esc(item.id)}" title="Remove from wishlist" aria-label="Remove from wishlist">★</button>
      On wishlist in
      <select data-wish-select="${esc(item.id)}" aria-label="Wishlist group">
        ${options.map((g) => `<option${g === current ? " selected" : ""}>${esc(g)}</option>`).join("")}
        <option value="__new">New group…</option>
      </select>
    </span>`;
  }

  // One delegated listener for every owned checkbox and wishlist control on the page.
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.owned) Owned.set(t.dataset.owned, t.checked);
    if (t.dataset.ownedCount) Owned.setCount(t.dataset.ownedCount, Math.max(1, Math.round(+t.value || 1)));
    if (t.dataset.wishSelect) {
      const id = t.dataset.wishSelect;
      let group = t.value;
      if (group === "__new") group = (prompt("Name the new wishlist group:") || "").trim();
      if (group) Wishlist.add(id, group);
      else t.value = Wishlist.group(id);
    }
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wish]");
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.wish;
    // New wishlist items go in a group named after their category (Weapons, Components...).
    if (Wishlist.isWanted(id)) Wishlist.remove(id);
    else Wishlist.add(id, (itemById.get(id) || {}).category || "Other");
  });

  function thingsToKnow(item) {
    const list = item.thingsToKnow || [];
    if (!list.length) return "";
    return `<h3>Things to know</h3>
      <ul class="ttk">${list
        .map((t) => `<li class="ttk-${t.level === "warn" ? "warn" : "info"}"><span class="ttk-icon">${t.level === "warn" ? "!" : "i"}</span>${esc(t.text)}</li>`)
        .join("")}</ul>`;
  }

  const tagClass = (name) => `tag cat-${String(name || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  // Labels and units for item stats, in display order. `better` says which way is an upgrade.
  const STATS = [
    ["dps", "DPS", "", "high"],
    ["sustained", "Sustained DPS", "", "high"],
    ["alpha", "Damage per shot", "", "high"],
    ["rpm", "Fire rate", "rpm", "high"],
    ["ammo", "Ammo", "rounds", "high"],
    ["damage", "Damage", "", "high"],
    ["shieldHp", "Shield HP", "", "high"],
    ["shieldRegen", "Shield regen", "HP/s", "high"],
    ["downedDelay", "Regen delay when down", "s", "low"],
    ["damageDelay", "Regen delay after hit", "s", "low"],
    ["resPhysical", "Physical resistance", "%", "high"],
    ["resEnergy", "Energy resistance", "%", "high"],
    ["resDistortion", "Distortion resistance", "%", "high"],
    ["powerOut", "Power output", "segments", "high"],
    ["coolOut", "Cooling", "segments", "high"],
    ["qtSpeed", "Quantum speed", "Mm/s", "high"],
    ["spool", "Spool time", "s", "low"],
    ["qtCooldown", "Quantum cooldown", "s", "low"],
    ["qtFuel", "Quantum fuel use", "per Gm", "low"],
    ["tuning", "Jump tuning rate", "", "high"],
    ["alignment", "Jump alignment rate", "", "high"],
    ["jumpFuel", "Jump fuel multiplier", "x", "low"],
    ["aimRange", "Aim assist range", "m", "high"],
    ["missiles", "Holds", "", "high"],
    ["missileSize", "Holds size", "", "high"],
    ["mounts", "Weapon mounts", "", "high"],
    ["mountSize", "Max size", "", "high"],
    ["minePower", "Laser power", "", "high"],
    ["mineMin", "Min laser power", "", "low"],
    ["extract", "Extraction rate", "", "high"],
    ["optRange", "Optimal range", "m", "high"],
    ["moduleSlots", "Module slots", "", "high"],
    ["charges", "Charges", "", "high"],
    ["duration", "Duration", "s", "high"],
    ["force", "Tractor force", "kN", "high"],
    ["jamRange", "Jammer range", "m", "high"],
    ["empDamage", "EMP damage", "", "high"],
    ["empRadius", "EMP radius", "m", "high"],
    ["charge", "Charge time", "s", "low"],
    ["lockTime", "Lock time", "s", "low"],
    ["lockRange", "Lock range", "m", "high"],
    ["rangeM", "Range", "m", "high"],
    ["speed", "Speed", "m/s", "high"],
    ["power", "Power draw", "segments", "low"],
    ["coolant", "Coolant draw", "segments", "low"],
    ["em", "EM signature", "", "low"],
    ["ir", "IR signature", "", "low"],
    ["hp", "Durability", "HP", "high"],
  ];
  const statInfo = new Map(STATS.map(([k, label, unit, better]) => [k, { key: k, label, unit, better }]));

  // The one number that best describes each type, for lists, menus and upgrade deltas.
  const KEY_STAT = {
    WeaponGun: "dps", Shield: "shieldHp", PowerPlant: "powerOut", Cooler: "coolOut", QuantumDrive: "qtSpeed",
    JumpDrive: "tuning", Radar: "aimRange", Missile: "damage", Bomb: "damage", MissileLauncher: "missiles",
    BombLauncher: "missiles", GroundVehicleMissileLauncher: "missiles", Turret: "mounts", WeaponMining: "minePower",
    MiningModifier: "charges", TractorBeam: "force", TowingBeam: "force", SalvageHead: "force",
    QuantumInterdictionGenerator: "jamRange", EMP: "empDamage",
  };
  const keyStat = (item) => (item && item.kind ? statInfo.get(KEY_STAT[item.kind.split(".")[0]]) : null) || null;
  function keyStatText(item) {
    const k = keyStat(item);
    const v = k && item.stats[k.key];
    return v != null ? `${fmt(v)}${k.unit ? " " + k.unit : ""} ${k.key === "dps" ? "DPS" : k.label.toLowerCase()}` : "";
  }

  window.Parts = {
    esc, fmt, published, today, siteLink, items, itemById, ships, shipById,
    availability, availabilityLabel, bestPrice, cheapest, fits, candidates,
    Owned, Wishlist, Builds, onChange, renderPendingBanner, ownedToggle, wishlistControl, thingsToKnow, tagClass,
    STATS, statInfo, keyStat, keyStatText,
  };
})();
