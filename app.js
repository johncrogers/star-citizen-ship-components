// Ship components viewer: the parts catalog (wishlist and all parts), plus the loadout planner and
// saved builds from planner.js. Records come from common.js.
(function () {
  const {
    esc, fmt, published, items, itemById, shipById, availability, availabilityLabel, bestPrice,
    Owned, Wishlist, Builds, onChange, renderPendingBanner, ownedToggle, wishlistControl, thingsToKnow, tagClass,
    STATS, keyStatText,
  } = window.Parts;
  const Filters = window.PartFilters;
  const Planner = window.Planner;
  const locationsHref = ((window.SITE || {}).links || []).find((l) => l.id === "locations")?.href;
  const shipsHref = ((window.SITE || {}).links || []).find((l) => l.id === "ships")?.href;
  const shopLink = (b) =>
    locationsHref && b.code
      ? `<a href="${esc(locationsHref)}#code:${encodeURIComponent(b.code)}" title="Where it is and how to get there">${esc(b.location)}</a>`
      : esc(b.location);
  const catalogMeta = window.COMPONENT_CATALOG_META || {};

  const CATEGORY_ORDER = ["Weapons", "Mounts & turrets", "Missiles & bombs", "Components", "Mining & salvage", "Utility", "Paints & flair"];

  const SCOPE_KEY = "sc-ship-components:scope";
  let savedScope = "all";
  try { savedScope = localStorage.getItem(SCOPE_KEY) || (Object.keys(Wishlist.all()).length ? "wishlist" : "all"); } catch (e) { /* storage unavailable */ }
  if (savedScope === "plan" || savedScope === "builds") savedScope = "all"; // the hash opens those
  const state = { scope: savedScope, query: "", category: "", availability: "", owned: "", sort: "list", selected: null };
  const planMode = () => state.scope === "plan" || state.scope === "builds";

  const $ = (id) => document.getElementById(id);

  // Search text doesn't depend on user state, so build it once.
  const haystacks = new Map(
    items.map((s) => [
      s.id,
      [
        s.name, s.manufacturer, s.category, s.type, s.grade && `grade ${s.grade}`, s.class, s.damage, s.event,
        s.description, s.notes,
        ...s.facts.map(([k, v]) => `${k} ${v}`),
        ...(s.thingsToKnow || []).map((t) => t.text),
        ...s.buy.map((b) => b.location),
        ...(s.ships || []).map((id) => (shipById.get(id) || {}).name),
      ].filter(Boolean).join(" ").toLowerCase(),
    ])
  );

  const categoryOf = (s) => (state.scope === "wishlist" ? Wishlist.group(s.id) : s.category);
  const categories = () => {
    if (state.scope === "wishlist") return Wishlist.groups();
    const present = new Set(items.map((s) => s.category));
    return [...CATEGORY_ORDER.filter((c) => present.has(c)), ...[...present].filter((c) => !CATEGORY_ORDER.includes(c))];
  };
  const inScope = () => (state.scope === "wishlist" ? items.filter((s) => Wishlist.isWanted(s.id)) : items);

  function filtered() {
    const terms = Filters.parse(state.query);
    const out = inScope().filter(
      (s) =>
        (!state.category || categoryOf(s) === state.category) &&
        (!state.availability || availability(s) === state.availability) &&
        (!state.owned || (state.owned === "owned") === Owned.isOwned(s.id)) &&
        Filters.matches(terms, s, haystacks.get(s.id))
    );
    const priceKey = (s, dir) => bestPrice(s) ?? (dir > 0 ? Infinity : -Infinity);
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (state.sort === "list") {
      if (state.scope === "wishlist") {
        const groups = Wishlist.groups();
        const ids = Object.keys(Wishlist.all());
        out.sort((a, b) => groups.indexOf(Wishlist.group(a.id)) - groups.indexOf(Wishlist.group(b.id)) || ids.indexOf(a.id) - ids.indexOf(b.id));
      } else {
        // Category, type, then size; parts you can buy before ones you can't.
        out.sort((a, b) =>
          CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.type.localeCompare(b.type) ||
          (a.stats.size || 0) - (b.stats.size || 0) || (b.buy.length > 0) - (a.buy.length > 0) || byName(a, b));
      }
    }
    if (state.sort === "price-asc") out.sort((a, b) => priceKey(a, 1) - priceKey(b, 1) || byName(a, b));
    if (state.sort === "price-desc") out.sort((a, b) => priceKey(b, -1) - priceKey(a, -1) || byName(a, b));
    if (state.sort === "name") out.sort(byName);
    if (state.sort === "manufacturer") out.sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || byName(a, b));
    if (state.sort.startsWith("stat:") || state.sort.startsWith("statlow:")) {
      const low = state.sort.startsWith("statlow:");
      const field = Filters.numField(state.sort.split(":")[1]);
      out.sort((a, b) => {
        const va = field.get(a), vb = field.get(b);
        if (va == null || vb == null) return (va == null) - (vb == null) || byName(a, b);
        return (low ? va - vb : vb - va) || byName(a, b);
      });
    }
    return out;
  }

  function renderScope() {
    const wanted = items.filter((s) => Wishlist.isWanted(s.id)).length;
    $("scope").innerHTML = [
      ["wishlist", "My wishlist", wanted],
      ["all", "All parts", items.length],
      ["plan", "Loadout planner", null],
      ["builds", "My builds", Object.keys(Builds.all()).length],
    ]
      .map(([k, label, n]) => `<button class="tab${state.scope === k ? " on" : ""}" data-scope="${k}">${label}${n != null ? ` <span>${fmt(n)}</span>` : ""}</button>`)
      .join("");
  }

  function renderChips() {
    const pool = inScope();
    const cats = categories();
    if (state.category && !cats.includes(state.category)) state.category = "";
    $("categoryChips").innerHTML = ["", ...cats]
      .map((c) => {
        const count = c ? pool.filter((s) => categoryOf(s) === c).length : pool.length;
        return `<button class="chip${state.category === c ? " on" : ""}" data-cat="${esc(c)}">${esc(c || "All")} <span>${fmt(count)}</span></button>`;
      })
      .join("");
  }

  const gradeText = (s) => (s.grade ? `${s.class ? s.class + " " : ""}grade ${s.grade}` : s.class || "");
  const subLine = (s) =>
    [s.manufacturer !== "Unknown" ? s.manufacturer : null, s.type, s.stats.size && s.type !== "Paint" ? `S${s.stats.size}` : null, gradeText(s)]
      .filter(Boolean).map(esc).join(" · ");

  function renderList() {
    const list = filtered();
    if (state.selected && !list.some((s) => s.id === state.selected)) state.selected = null;
    if (!state.selected && list.length) state.selected = list[0].id;

    const shownKeys = Filters.numericKeys(Filters.parse(state.query));
    const sortKey = state.sort.includes(":") ? state.sort.split(":")[1] : null;
    if (sortKey && !shownKeys.includes(sortKey)) shownKeys.push(sortKey);
    const shownFields = shownKeys.filter((k) => k !== "price" && k !== "size").map(Filters.numField);
    const statLine = (s) => {
      const parts = shownFields.length ? shownFields.map((f) => Filters.formatValue(f, s) || `${f.label} ?`) : [keyStatText(s)].filter(Boolean);
      return parts.length ? `<span class="row-stats">${parts.map(esc).join(" · ")}</span>` : "";
    };

    const LIMIT = 300;
    $("list").innerHTML = list.length
      ? list
          .slice(0, LIMIT)
          .map((s) => {
            const a = availability(s);
            const price = bestPrice(s);
            const owned = Owned.isOwned(s.id);
            const wanted = Wishlist.isWanted(s.id);
            const cat = categoryOf(s);
            return `<li class="row${s.id === state.selected ? " active" : ""}${owned ? " owned" : ""}">
              <span class="row-controls">
                <button type="button" class="star${wanted ? " on" : ""}" data-wish="${esc(s.id)}" title="${wanted ? "Remove from" : "Add to"} wishlist" aria-label="${wanted ? "Remove" : "Add"} ${esc(s.name)} ${wanted ? "from" : "to"} wishlist">${wanted ? "★" : "☆"}</button>
                <input type="checkbox" class="row-check" data-owned="${esc(s.id)}"${owned ? " checked" : ""} title="Owned" aria-label="Owned ${esc(s.name)}">
              </span>
              <a href="#${esc(s.id)}" class="row-link">
                <div class="row-main">
                  <strong>${esc(s.name)}</strong>
                  <span class="sub">${subLine(s)}</span>
                  ${statLine(s)}
                </div>
                <div class="row-side">
                  <span class="${tagClass(cat)}">${esc(cat)}</span>
                  <span class="price ${a}">${price != null ? fmt(price) + " aUEC" : availabilityLabel[a]}</span>
                </div>
              </a>
            </li>`;
          })
          .join("") + (list.length > LIMIT ? `<li class="empty">${fmt(list.length - LIMIT)} more. Narrow the search to see them.</li>` : "")
      : `<li class="empty">${state.scope === "wishlist" && !state.query ? "Nothing here yet. Switch to All parts and tap ☆ to add some." : "No parts match."}</li>`;

    const pool = inScope();
    const ownedCount = pool.filter((s) => Owned.isOwned(s.id)).length;
    if (state.scope === "wishlist") {
      const buyable = list.filter((s) => !Owned.isOwned(s.id) && bestPrice(s) != null);
      const total = buyable.reduce((sum, s) => sum + bestPrice(s), 0);
      $("total").innerHTML = `
        <span>${ownedCount} / ${pool.length} owned · ${buyable.length} shown still to buy for</span>
        <strong>${fmt(total)} aUEC</strong>`;
    } else {
      $("total").innerHTML = `<span>${fmt(list.length)} shown · ${ownedCount} owned</span>`;
    }
  }

  function statsFor(s) {
    const row = (label, value, unit) =>
      value == null || value === "" ? "" : `<div class="stat"><dt>${esc(label)}</dt><dd>${typeof value === "number" ? fmt(value) : esc(value)}${unit ? ` <small>${esc(unit)}</small>` : ""}</dd></div>`;
    return [
      row("Size", s.type === "Paint" ? null : s.stats.size),
      row("Grade", s.grade),
      row("Class", s.class),
      row("Damage type", s.damage),
      ...STATS.map(([k, label, unit]) => row(label, s.stats[k], unit)),
      ...s.facts.map(([k, v]) => row(k, v)),
    ].join("");
  }

  function howToGet(s) {
    const ways = [];
    if (s.buy.length) ways.push(`Sold at ${s.buy.length} shop${s.buy.length > 1 ? "s" : ""}`);
    if (s.loot) ways.push("Can be looted");
    if (s.craft) ways.push("Can be crafted");
    if (s.event) ways.push(`Event reward (${esc(s.event)})`);
    if (ways.length) return ways.join(" · ");
    return s.type === "Paint"
      ? "Not sold in game. Most paints come from the pledge store, a ship pack or an event."
      : "No known source. It may come stock on a ship, be a mission reward, or not be in the game yet.";
  }

  function buyTable(s) {
    if (!s.buy.length) return "";
    const best = bestPrice(s);
    const row = (b) =>
      `<tr${b.price === best ? ' class="best"' : ""}><td>${shopLink(b)}</td><td class="num">${fmt(b.price)}</td><td class="num muted">${esc(b.date || "")}${b.source === "cstone" ? " <small>cstone</small>" : ""}</td></tr>`;
    const head = `<thead><tr><th>Shop</th><th class="num">aUEC</th><th class="num">Checked</th></tr></thead>`;
    const SHOW = 8;
    const rest = s.buy.slice(SHOW);
    return `<table>${head}<tbody>${s.buy.slice(0, SHOW).map(row).join("")}</tbody></table>
      ${rest.length ? `<details class="more-shops"><summary>${rest.length} more shop${rest.length > 1 ? "s" : ""}</summary><table><tbody>${rest.map(row).join("")}</tbody></table></details>` : ""}`;
  }

  // Ship links open the planner on that ship.
  const shipLinks = (list, max = 40) =>
    list.slice(0, max).map((sh) => `<a class="ship-chip" href="#plan=${esc(sh.id)}">${esc(sh.name)}</a>`).join("") +
    (list.length > max ? ` <span class="muted">and ${list.length - max} more</span>` : "");

  function shipsSection(s) {
    if (s.type === "Paint") {
      const list = (s.ships || []).map((id) => shipById.get(id)).filter(Boolean);
      return `<h3>Fits</h3>${list.length ? `<p class="ship-chips">${shipLinks(list)}</p>` : `<p class="muted">The game data doesn't say which ship this paint is for.</p>`}`;
    }
    if (!s.kind || s.category === "Paints & flair") return "";
    const { stock, fit } = Planner.shipsFor(s);
    return `<h3>Comes stock on</h3>
      ${stock.length ? `<p class="ship-chips">${shipLinks(stock)}</p>` : `<p class="muted">No ship.</p>`}
      <h3>Also fits</h3>
      ${fit.length ? `<p class="ship-chips">${shipLinks(fit)}</p>` : `<p class="muted">No other ship has a free slot for it in its stock layout.</p>`}
      <p class="note">Click a ship to open it in the loadout planner.</p>`;
  }

  function slotsInside(s) {
    if (!s.slots.length) return "";
    return `<h3>Holds</h3><ul class="plain">${s.slots
      .map((sl) => `<li>${esc(sl.l)}: ${esc(sl.t.map((t) => t.split(".").pop()).join(" or "))}${sl.s[1] ? ` <span class="size">S${sl.s[0] === sl.s[1] ? sl.s[1] : sl.s.join("–")}</span>` : ""}</li>`)
      .join("")}</ul>`;
  }

  function renderDetail() {
    const s = itemById.get(state.selected);
    if (!s) {
      $("detail").innerHTML = `<p class="empty">Select a part.</p>`;
      return;
    }
    const a = availability(s);
    const links = [
      s.links.cstone && `<a href="${esc(s.links.cstone)}" target="_blank" rel="noopener">cstone ↗</a>`,
      s.links.uex && `<a href="${esc(s.links.uex)}" target="_blank" rel="noopener">UEX ↗</a>`,
      s.links.wiki && `<a href="${esc(s.links.wiki)}" target="_blank" rel="noopener">Wiki ↗</a>`,
    ].filter(Boolean).join("");
    const badgeCat = Wishlist.isWanted(s.id) ? Wishlist.group(s.id) : s.category;

    $("detail").innerHTML = `
      <div class="hero item-hero">
        ${s.image
          ? `<img src="${esc(s.image)}" alt="${esc(s.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'No image'}))">`
          : `<div class="noimg">No image yet</div>`}
      </div>
      <div class="detail-head">
        <div>
          <h2>${esc(s.name)}</h2>
          <p class="sub">${subLine(s)}${s.category !== badgeCat ? ` · ${esc(s.category)}` : ""}</p>
        </div>
        <div class="badges">
          <span class="${tagClass(badgeCat)}">${esc(badgeCat)}</span>
          <span class="price ${a}">${bestPrice(s) != null ? `from ${fmt(bestPrice(s))} aUEC` : availabilityLabel[a]}</span>
        </div>
      </div>
      <div class="toggles">${wishlistControl(s)}${ownedToggle(s.id)}</div>
      ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
      <nav class="links">${links}</nav>

      ${thingsToKnow(s)}

      <h3>Stats</h3>
      <dl class="stats">${statsFor(s)}</dl>
      ${s.stats.power != null || s.stats.powerOut != null ? `<p class="note">Power and coolant are in segments (the bars in the ship's power screen). Signatures are at full power.</p>` : ""}

      ${slotsInside(s)}
      ${shipsSection(s)}

      <h3>How to get it</h3>
      <p>${howToGet(s)}</p>
      ${buyTable(s)}

      <h3>My notes</h3>
      <p class="${s.notes ? "" : "muted"}">${s.notes ? esc(s.notes) : published ? "No notes yet." : "No notes yet. Add a record for this part in components.data.js."}</p>
    `;
  }

  const PANEL_KEY = "sc-ship-components:filters-open";
  let panelOpen = false;
  try { panelOpen = localStorage.getItem(PANEL_KEY) === "1"; } catch (e) { /* storage unavailable */ }

  function renderFilters() {
    const panel = $("filterPanel");
    const terms = Filters.parse(state.query);
    const structured = terms.filter((t) => t.kind !== "free").length;
    $("filtersToggle").innerHTML = `Filters${structured ? ` <span class="count">${structured}</span>` : ""}`;
    $("filtersToggle").setAttribute("aria-expanded", String(panelOpen));
    $("filtersToggle").classList.toggle("on", panelOpen);
    panel.hidden = !panelOpen;
    if (panelOpen && !panel.contains(document.activeElement)) Filters.renderPanel(panel, items, state.query);

    $("activeFilters").innerHTML = terms.length
      ? terms
          .map((t) => `<button type="button" class="filter-chip${t.kind === "free" ? " free" : ""}${t.neg ? " neg" : ""}" data-remove-term="${esc(t.raw)}" title="Remove">${esc(Filters.termLabel(t))} <span aria-hidden="true">×</span></button>`)
          .join("") + (terms.length > 1 ? `<button type="button" class="filter-chip clear" data-clear-filters>Clear all</button>` : "")
      : "";
  }

  function setQuery(q) {
    state.query = q;
    $("search").value = q;
    render();
    saveQueryToUrl();
  }

  function saveQueryToUrl() {
    const url = new URL(location.href);
    if (state.query.trim()) url.searchParams.set("q", state.query.trim());
    else url.searchParams.delete("q");
    try { history.replaceState(null, "", url); } catch (e) { /* some browsers block this on file:// */ }
  }

  let shownDetail = null;
  function render() {
    document.body.classList.toggle("plan-mode", planMode());
    $("planView").hidden = !planMode();
    renderScope();
    renderPendingBanner($("pending"));
    if (state.scope === "plan") {
      Planner.render($("planView"));
      const n = Object.keys(Builds.all()).length;
      $("total").innerHTML = `<span>${fmt(n)} saved build${n === 1 ? "" : "s"}</span>`;
      return;
    }
    if (state.scope === "builds") {
      Planner.renderBuilds($("planView"));
      $("total").innerHTML = "";
      return;
    }
    renderFilters();
    renderChips();
    renderList();
    renderDetail();
    if (state.selected !== shownDetail) {
      $("detail").scrollTop = 0;
      shownDetail = state.selected;
    }
  }

  function setScope(scope) {
    state.scope = scope;
    state.category = "";
    if (!planMode()) try { localStorage.setItem(SCOPE_KEY, scope); } catch (e) { /* storage unavailable */ }
  }

  // #<item id> selects a part. #plan, #plan=<ship> and #plan=<ship>/<build> open the planner.
  // #builds opens My builds.
  function selectFromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === "builds") return setScope("builds");
    if (h === "plan" || h.startsWith("plan=")) {
      const [ship, build] = h.slice(5).split("/");
      Planner.open(ship && shipById.has(ship) ? ship : null, build || null);
      return setScope("plan");
    }
    if (!h || !itemById.has(h)) return;
    state.selected = h;
    if (planMode()) {
      let back = "all";
      try { back = localStorage.getItem(SCOPE_KEY) || "all"; } catch (e) { /* storage unavailable */ }
      setScope(back);
    }
    if (state.scope === "wishlist" && !Wishlist.isWanted(h)) setScope("all");
    if (!filtered().some((s) => s.id === h)) {
      state.query = $("search").value = "";
      state.category = state.availability = state.owned = "";
      $("availability").value = $("owned").value = "";
    }
  }

  let typing;
  $("search").addEventListener("input", (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.query = e.target.value; render(); saveQueryToUrl(); }, 120);
  });
  $("meta").textContent = `${fmt(items.length)} parts · ${fmt(catalogMeta.ships || 0)} ship loadouts · data for patch ${catalogMeta.patch || "?"} · gathered ${catalogMeta.gathered || "?"} · prices are crowdsourced, so check the date before you fly out`;
  $("siteLinks").innerHTML = ((window.SITE || {}).links || [])
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)} →</a>`)
    .join("");
  $("filtersToggle").addEventListener("click", () => {
    panelOpen = !panelOpen;
    try { localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    render();
  });
  Filters.bindPanel($("filterPanel"), () => state.query, setQuery);
  $("activeFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.hasAttribute("data-clear-filters")) setQuery("");
    else if (btn.dataset.removeTerm != null) setQuery(Filters.removeTerm(state.query, btn.dataset.removeTerm));
  });
  $("availability").addEventListener("change", (e) => { state.availability = e.target.value; render(); });
  $("owned").addEventListener("change", (e) => { state.owned = e.target.value; render(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("scope").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-scope]");
    if (!btn) return;
    setScope(btn.dataset.scope);
    if (btn.dataset.scope === "plan") Planner.syncHash();
    else if (btn.dataset.scope === "builds") try { history.replaceState(null, "", "#builds"); } catch (err) { /* file:// */ }
    else if (location.hash.startsWith("#plan") || location.hash === "#builds") try { history.replaceState(null, "", location.pathname + location.search); } catch (err) { /* file:// */ }
    render();
  });
  $("categoryChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    state.category = btn.dataset.cat;
    render();
  });
  Planner.bind($("planView"));
  Planner.onChange(render);
  const scrollToSelected = () => {
    const row = document.querySelector(".row.active");
    if (row) row.scrollIntoView({ block: "nearest" });
  };
  window.addEventListener("hashchange", () => { selectFromHash(); render(); if (!planMode()) scrollToSelected(); else window.scrollTo(0, 0); });
  onChange(render);

  const initialQuery = new URLSearchParams(location.search).get("q");
  if (initialQuery) state.query = $("search").value = initialQuery;
  selectFromHash();
  render();
  if (location.hash && !planMode()) scrollToSelected();
})();
