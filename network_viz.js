(() => {
  "use strict";

  const INDEX_URL = "data/network/index.json";
  const WORKS_URL = "data/network/works_meta.json";
  const TYPE_KEYS = [
    "Article",
    "Book",
    "Book Chapter",
    "Conference Proceeding",
    "Federal Grant",
    "Patent",
    "Clinical Trial",
  ];
  const TYPE_LABELS = [
    "Article",
    "Book",
    "Book Chapter",
    "Conference Proceeding",
    "Federal Grant",
    "Patent",
    "Clinical Trial",
  ];
  const RANK_NAMES = [
    "Professor",
    "Associate Professor",
    "Assistant Professor",
    "Other MIT",
    "External",
  ];
  const RANK_COLORS = ["#0066b4", "#c04040", "#e07a40", "#6a7a8a", "#aab0ba"];
  const REL_NAMES = ["Within unit", "Across MIT", "External"];
  const REL_COLORS = ["#1f7a4d", "#9a6a00", "#7a4ac6"];
  const SCOPE_RELS = {
    within_unit: [0],
    across_units: [1],
    intra: [0, 1],
    inter: [2],
    all: [0, 1, 2],
  };
  const SCHOOL_COLORS = {
    "Engineering, School of": "#e15759",
    "Science, School of": "#4e79a7",
    "Computing, Schwarzman College of": "#59a14f",
    "MIT-WHOI": "#b07aa1",
    "Architecture and Planning, School of": "#f28e2b",
    "Management, School of": "#76b7b2",
    "Humanities, Arts, and Social Sciences, School of": "#8c6bb1",
  };
  const VIEWS = new Set(["explore", "focus", "compare", "path", "bridges"]);
  const LEVELS = new Set(["school", "department", "unit", "person"]);
  // "Show partners" (Top N) control — trims the aggregate partner/unit nodes shown in the
  // Anchor view (and, when it doesn't change anything, School/Department too) to the
  // strongest N by tie works. "all" removes the cap. Page-local only (own sessionStorage key,
  // not shared with counts_v2.html's PCT_KEY-style state).
  const TOP_PARTNER_VALUES = new Set(["25", "50", "100", "all"]);
  const TOPN_KEY = "aad2024_network_topn";

  const $ = (id) => document.getElementById(id);
  const canvas = $("networkCanvas");
  const ctx = canvas.getContext("2d");

  const state = {
    view: "explore",
    level: "person",
    unitKind: "Department",
    anchorKey: null,
    scope: "all",
    topAnchors: 50,
    partnerLimit: 150,
    topPartners: 50,
    rankBy: "total",
    cap: "all",
    types: new Set(TYPE_KEYS),
    selectedPid: null,
    compareA: null,
    compareB: null,
    compareLimit: 100,
    compareShowAll: false,
    pathStart: null,
    pathEnd: null,
    drawerTab: "overview",
  };

  let index = null;
  let anchorByKey = new Map();
  let memberships = new Map();
  let payloadCache = new Map();
  let worksMeta = null;
  let activePayload = null;
  let currentFilteredEdges = [];
  let activeGraph = emptyGraph();
  let refreshId = 0;
  let simulationFrame = null;
  let resizeTimer = null;
  let toastTimer = null;
  let searchMatches = [];
  let searchActive = -1;
  let selectedGraphIndex = -1;
  let hoverGraphIndex = -1;
  let draggingIndex = -1;
  let pointerDown = null;
  let panning = false;
  let panX = 0;
  let panY = 0;
  let zoom = 1;

  function emptyGraph() {
    return {
      nodes: [],
      links: [],
      static: true,
      mode: "empty",
      meta: {},
    };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function number(value) {
    return Number(value || 0).toLocaleString();
  }

  function shortName(name) {
    const parts = String(name || "").split(",");
    const last = parts[0].trim();
    const first = (parts[1] || "").trim();
    return first ? `${last}, ${first[0]}.` : last;
  }

  function compactUnit(value) {
    return String(value || "")
      .replace(/, Department of$/i, "")
      .replace(/, School of$/i, "")
      .replace(/, Program in$/i, "")
      .replace(/, The$/i, "");
  }

  function hashFraction(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 10000) / 10000;
  }

  function graphWidth() {
    return canvas.getBoundingClientRect().width || 900;
  }

  function graphHeight() {
    return canvas.getBoundingClientRect().height || 600;
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    draw();
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${url} (${response.status})`);
    return response.json();
  }

  function showLoading(message = "Loading network data...") {
    $("loadingMask").textContent = message;
    $("loadingMask").hidden = false;
  }

  function hideLoading() {
    $("loadingMask").hidden = true;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, 2200);
  }

  function buildMemberships() {
    memberships = new Map();
    Object.entries(index.anchor_pids || {}).forEach(([key, pids]) => {
      pids.forEach((pid) => {
        if (!memberships.has(pid)) memberships.set(pid, []);
        memberships.get(pid).push(key);
      });
    });
  }

  function anchorsForUnitKind(kind = state.unitKind) {
    return index.anchors.filter((anchor) => anchor.unit_kind === kind);
  }

  function resolveAnchor(raw) {
    if (!raw) return null;
    return index.anchors.find((anchor) => anchor.key === raw)
      || index.anchors.find((anchor) => anchor.label === raw)
      || index.anchors.find((anchor) => anchor.kind === "unit" && anchor.key.endsWith(`|U|${raw}`))
      || null;
  }

  function preferredAnchorForPerson(pid) {
    const keys = memberships.get(String(pid)) || [];
    if (keys.includes(state.anchorKey)) return anchorByKey.get(state.anchorKey);
    const sameKindUnit = keys
      .map((key) => anchorByKey.get(key))
      .find((anchor) => anchor && anchor.kind === "unit" && anchor.unit_kind === state.unitKind);
    if (sameKindUnit) return sameKindUnit;
    const departmentUnit = keys
      .map((key) => anchorByKey.get(key))
      .find((anchor) => anchor && anchor.kind === "unit" && anchor.unit_kind === "Department");
    if (departmentUnit) return departmentUnit;
    return keys.map((key) => anchorByKey.get(key)).find(Boolean) || null;
  }

  function readUrlState() {
    const query = new URLSearchParams(location.search);
    const pid = query.get("pid");
    const requestedView = query.get("view");
    state.view = VIEWS.has(requestedView) ? requestedView : (pid ? "focus" : "explore");
    state.level = LEVELS.has(query.get("level")) ? query.get("level") : "person";
    state.unitKind = query.get("uk") === "Program" ? "Program" : "Department";
    state.scope = SCOPE_RELS[query.get("scope")] ? query.get("scope") : "all";
    state.topAnchors = clampInteger(query.get("top"), 1, 1000, 50);
    state.partnerLimit = clampInteger(query.get("partners"), 1, 2000, 150);

    // "Show partners" (Top N): restore the page-local remembered choice first (so navigating
    // between anchors keeps it), then let an explicit ?topn= link win over that stored choice —
    // same precedence counts_v2.html uses for its PCT_KEY restore vs. its ?pct= deep link.
    let restoredTopPartners = state.topPartners;
    try {
      const stored = sessionStorage.getItem(TOPN_KEY);
      if (TOP_PARTNER_VALUES.has(stored)) restoredTopPartners = stored === "all" ? "all" : parseInt(stored, 10);
    } catch (e) { /* sessionStorage unavailable — keep default */ }
    const topnRaw = query.get("topn");
    if (TOP_PARTNER_VALUES.has(topnRaw)) {
      state.topPartners = topnRaw === "all" ? "all" : parseInt(topnRaw, 10);
      // An explicit link also updates the remembered choice, same as counts_v2.html's
      // ?pct= deep link persists into its PCT_KEY — so it sticks across a later reload or
      // anchor switch within the same session, not just for this one page view.
      try { sessionStorage.setItem(TOPN_KEY, topnRaw); } catch (e) { /* ignore */ }
    } else {
      state.topPartners = restoredTopPartners;
    }

    state.compareLimit = clampInteger(query.get("compareLimit"), 10, 2000, 100);
    state.compareShowAll = query.get("compareAll") === "1";
    state.rankBy = ["total", "1", "2"].includes(query.get("rank")) ? query.get("rank") : "total";
    state.cap = ["20", "50", "100", "all"].includes(query.get("cap")) ? query.get("cap") : "all";
    state.selectedPid = pid || null;
    state.pathStart = query.get("from") || null;
    state.pathEnd = query.get("to") || null;

    const requestedTypes = query.get("types");
    if (requestedTypes) {
      const selected = requestedTypes.split("|").filter((type) => TYPE_KEYS.includes(type));
      state.types = new Set(selected.length ? selected : TYPE_KEYS);
    }

    const found = resolveAnchor(query.get("anchor"));
    if (found) {
      state.anchorKey = found.key;
      state.unitKind = found.unit_kind;
    } else if (pid) {
      const personAnchor = preferredAnchorForPerson(pid);
      if (personAnchor) {
        state.anchorKey = personAnchor.key;
        state.unitKind = personAnchor.unit_kind;
      }
    }

    const available = anchorsForUnitKind();
    if (!state.anchorKey || !anchorByKey.has(state.anchorKey)) {
      state.anchorKey = available.find((anchor) => anchor.key === "Department|U|8926")?.key
        || available.find((anchor) => anchor.kind === "unit")?.key
        || available[0]?.key
        || null;
    }

    state.compareA = resolveAnchor(query.get("ca"))?.key || state.anchorKey;
    state.compareB = resolveAnchor(query.get("cb"))?.key
      || available.find((anchor) => anchor.key !== state.compareA && anchor.kind === "unit")?.key
      || state.compareA;
  }

  function clampInteger(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }

  // Numeric cap implied by state.topPartners ("all" -> Infinity, i.e. no cap).
  function topPartnersCap() {
    return state.topPartners === "all" ? Infinity : Number(state.topPartners) || 50;
  }

  function syncUrl() {
    if (!index || !state.anchorKey) return;
    const query = new URLSearchParams();
    query.set("anchor", state.anchorKey);
    query.set("scope", state.scope);
    if (state.view !== "explore") query.set("view", state.view);
    if (state.level !== "person") query.set("level", state.level);
    if (state.unitKind !== "Department") query.set("uk", state.unitKind);
    if (state.topAnchors !== 50) query.set("top", String(state.topAnchors));
    if (state.partnerLimit !== 150) query.set("partners", String(state.partnerLimit));
    if (state.topPartners !== 50) query.set("topn", String(state.topPartners));
    if (state.compareLimit !== 100) query.set("compareLimit", String(state.compareLimit));
    if (state.compareShowAll) query.set("compareAll", "1");
    if (state.rankBy !== "total") query.set("rank", state.rankBy);
    if (state.cap !== "all") query.set("cap", state.cap);
    if (state.types.size !== TYPE_KEYS.length) query.set("types", [...state.types].join("|"));
    if (state.selectedPid) query.set("pid", state.selectedPid);
    if (state.view === "compare") {
      query.set("ca", state.compareA || state.anchorKey);
      query.set("cb", state.compareB || state.anchorKey);
    }
    if (state.view === "path") {
      if (state.pathStart) query.set("from", state.pathStart);
      if (state.pathEnd) query.set("to", state.pathEnd);
    }
    history.replaceState(null, "", `${location.pathname}?${query.toString()}`);
  }

  function optionGroups(anchors, selectedKey) {
    const units = anchors.filter((anchor) => anchor.kind === "unit")
      .sort((a, b) => a.label.localeCompare(b.label));
    const colleges = anchors.filter((anchor) => anchor.kind === "college")
      .sort((a, b) => a.label.localeCompare(b.label));
    const group = (label, values) => values.length
      ? `<optgroup label="${esc(label)}">${values.map((anchor) => (
        `<option value="${esc(anchor.key)}"${anchor.key === selectedKey ? " selected" : ""}>${esc(anchor.label)}</option>`
      )).join("")}</optgroup>`
      : "";
    return group("Units", units) + group("Colleges / Schools", colleges);
  }

  function fillAnchorControls() {
    const anchors = anchorsForUnitKind();
    if (!anchors.some((anchor) => anchor.key === state.anchorKey)) {
      state.anchorKey = anchors.find((anchor) => anchor.kind === "unit")?.key || anchors[0]?.key || null;
    }
    $("anchorSelect").innerHTML = optionGroups(anchors, state.anchorKey);

    if (!anchors.some((anchor) => anchor.key === state.compareA)) state.compareA = state.anchorKey;
    if (!anchors.some((anchor) => anchor.key === state.compareB) || state.compareB === state.compareA) {
      state.compareB = anchors.find((anchor) => anchor.key !== state.compareA && anchor.kind === "unit")?.key
        || anchors.find((anchor) => anchor.key !== state.compareA)?.key
        || state.compareA;
    }
    $("compareA").innerHTML = optionGroups(anchors, state.compareA);
    $("compareB").innerHTML = optionGroups(anchors, state.compareB);
  }

  function setSegment(containerId, value) {
    $(containerId).querySelectorAll("button[data-value]").forEach((button) => {
      const active = button.dataset.value === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function syncControls() {
    document.querySelectorAll(".mode-tab").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    setSegment("levelControl", state.level);
    setSegment("unitKindControl", state.unitKind);
    setSegment("scopeControl", state.scope);

    const isCompare = state.view === "compare";
    const isPath = state.view === "path";
    $("compareControls").hidden = !isCompare;
    $("pathControls").hidden = !isPath;
    $("levelField").hidden = state.view !== "explore";
    $("unitKindField").hidden = false;
    $("anchorField").hidden = isCompare;
    $("scopeField").hidden = false;
    // Find Scholar only where individual scholars are on screen (People level; Focus/Bridges keep
    // it since they're scholar-centric) — user asked for it to be hidden when not relevant.
    $("scholarSearchField").hidden = isCompare || isPath || (state.view === "explore" && state.level !== "person");
    // "Show partners" (Top N) on ALL Explore levels including People (user request 2026-07-16).
    // On People it combines with the Filters-panel partnerLimit (tighter cap wins). On School it
    // rarely bites (7 nodes) but stays for consistency. Focus/Compare/Path/Bridges keep their
    // own existing caps untouched.
    $("topPartnersField").hidden = state.view !== "explore";
    $("topPartnersSelect").value = String(state.topPartners);

    $("topAnchors").value = String(state.topAnchors);
    $("partnerLimit").value = String(state.partnerLimit);
    $("rankBy").value = state.rankBy;
    $("authorCap").value = state.cap;
    $("anchorSelect").value = state.anchorKey || "";
    $("compareA").value = state.compareA || "";
    $("compareB").value = state.compareB || "";
    $("compareLimit").value = String(state.compareLimit);
    $("compareLimit").disabled = state.compareShowAll;
    $("compareShowAll").checked = state.compareShowAll;

    document.querySelectorAll("#typeFilters input[data-type]").forEach((checkbox) => {
      checkbox.checked = state.types.has(checkbox.dataset.type);
      checkbox.disabled = state.cap !== "all";
    });
    $("typeFilterNote").textContent = state.cap === "all"
      ? "Medical units are included with both unit-type choices."
      : "Collaboration-type filtering is available when the author limit is set to No limit.";
  }

  async function loadPayload(key) {
    if (payloadCache.has(key)) return payloadCache.get(key);
    const anchor = anchorByKey.get(key);
    if (!anchor) throw new Error(`Unknown network anchor: ${key}`);
    const promise = fetchJson(`data/network/${anchor.payload}`);
    payloadCache.set(key, promise);
    try {
      const payload = await promise;
      payloadCache.set(key, payload);
      return payload;
    } catch (error) {
      payloadCache.delete(key);
      throw error;
    }
  }

  function relationFor(edge, anchorSet) {
    const aAnchor = anchorSet.has(edge[0]);
    const bAnchor = anchorSet.has(edge[1]);
    if (aAnchor && bAnchor) return 0;
    const aExternal = !aAnchor && index.people[edge[0]]?.[1] === 4;
    const bExternal = !bAnchor && index.people[edge[1]]?.[1] === 4;
    return aExternal || bExternal ? 2 : 1;
  }

  function filteredEdges(payload, anchorSet) {
    const allowed = new Set(SCOPE_RELS[state.scope]);
    const raw = payload.edges_cap[state.cap] || payload.edges_cap.all || [];
    const filterTypes = state.cap === "all" && state.types.size !== TYPE_KEYS.length;
    const result = [];
    raw.forEach((edge) => {
      const rel = relationFor(edge, anchorSet);
      if (!allowed.has(rel)) return;
      let works = Number(edge[2] || 0);
      if (filterTypes) {
        works = TYPE_KEYS.reduce((sum, type, typeIndex) => (
          sum + (state.types.has(type) ? Number(edge[4 + typeIndex] || 0) : 0)
        ), 0);
      }
      if (works <= 0) return;
      result.push({
        a: String(edge[0]),
        b: String(edge[1]),
        works,
        pairs: Number(edge[3] || 0),
        rel,
        types: TYPE_KEYS.map((_, typeIndex) => Number(edge[4 + typeIndex] || 0)),
        raw: edge,
      });
    });
    return result;
  }

  function personNode(pid, isAnchor, degree, x, y) {
    const person = index.people[pid] || ["Unknown", 3, ""];
    return {
      id: pid,
      pid,
      label: shortName(person[0]),
      full: person[0],
      rank: Number(person[1] ?? 3),
      extra: person[2] || "",
      isAnchor,
      deg: Number(degree || 0),
      works: Number(degree || 0),
      kind: "person",
      x,
      y,
      vx: 0,
      vy: 0,
    };
  }

  function buildPersonGraph(edges, anchorSet) {
    const degree = new Map();
    const ranked = new Map();
    edges.forEach((edge) => {
      degree.set(edge.a, (degree.get(edge.a) || 0) + edge.works);
      degree.set(edge.b, (degree.get(edge.b) || 0) + edge.works);
      if (state.rankBy === "total" || String(edge.rel) === state.rankBy) {
        ranked.set(edge.a, (ranked.get(edge.a) || 0) + edge.works);
        ranked.set(edge.b, (ranked.get(edge.b) || 0) + edge.works);
      }
    });

    const anchorSorted = [...degree.keys()]
      .filter((pid) => anchorSet.has(pid) && index.people[pid])
      .sort((a, b) => (ranked.get(b) || 0) - (ranked.get(a) || 0));
    const visibleAnchors = anchorSorted.slice(0, state.topAnchors);
    if (state.selectedPid && anchorSorted.includes(state.selectedPid) && !visibleAnchors.includes(state.selectedPid)) {
      visibleAnchors.push(state.selectedPid);
    }
    const visibleAnchorSet = new Set(visibleAnchors);

    const partners = new Set();
    edges.forEach((edge) => {
      if (visibleAnchorSet.has(edge.a) && !visibleAnchorSet.has(edge.b)) partners.add(edge.b);
      if (visibleAnchorSet.has(edge.b) && !visibleAnchorSet.has(edge.a)) partners.add(edge.a);
    });
    const partnerSorted = [...partners]
      .filter((pid) => index.people[pid])
      .sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0));
    // "Show partners" (Top N) applies here too (user request 2026-07-16): effective cap is the
    // tighter of the Filters-panel partnerLimit and the Top N control ("all" = Infinity).
    const personPartnerCap = Math.min(state.partnerLimit, topPartnersCap());
    const visiblePartners = partnerSorted.slice(0, personPartnerCap);
    if (state.selectedPid && partnerSorted.includes(state.selectedPid) && !visiblePartners.includes(state.selectedPid)) {
      visiblePartners.push(state.selectedPid);
    }

    const visiblePids = [...visibleAnchors, ...visiblePartners];
    const visibleSet = new Set(visiblePids);
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const innerRadius = Math.min(width, height) * 0.23;
    const outerRadius = Math.min(width, height) * 0.43;
    const nodes = [];
    const nodeIndex = new Map();

    visibleAnchors.forEach((pid, itemIndex) => {
      const angle = (Math.PI * 2 * itemIndex) / Math.max(1, visibleAnchors.length);
      const jitter = (hashFraction(pid) - 0.5) * 18;
      nodeIndex.set(pid, nodes.length);
      nodes.push(personNode(
        pid,
        true,
        degree.get(pid),
        centerX + (innerRadius + jitter) * Math.cos(angle),
        centerY + (innerRadius + jitter) * Math.sin(angle),
      ));
    });
    visiblePartners.forEach((pid, itemIndex) => {
      const angle = (Math.PI * 2 * itemIndex) / Math.max(1, visiblePartners.length);
      const jitter = (hashFraction(pid) - 0.5) * 28;
      nodeIndex.set(pid, nodes.length);
      nodes.push(personNode(
        pid,
        false,
        degree.get(pid),
        centerX + (outerRadius + jitter) * Math.cos(angle),
        centerY + (outerRadius + jitter) * Math.sin(angle),
      ));
    });

    const links = edges
      .filter((edge) => visibleSet.has(edge.a) && visibleSet.has(edge.b))
      .map((edge) => ({
        source: nodeIndex.get(edge.a),
        target: nodeIndex.get(edge.b),
        works: edge.works,
        pairs: edge.pairs,
        rel: edge.rel,
      }));

    return {
      nodes,
      links,
      static: false,
      mode: "person",
      meta: {
        anchorCount: visibleAnchors.length,
        droppedAnchors: Math.max(0, anchorSorted.length - visibleAnchors.length),
        droppedPartners: Math.max(0, partnerSorted.length - visiblePartners.length),
        totalAnchors: anchorSorted.length,
        totalPartners: partnerSorted.length,
        filteredEdges: edges,
        anchorSet,
      },
    };
  }

  function buildFocusGraph(edges, anchorSet, requestedPid) {
    let pid = requestedPid;
    if (!pid || !index.people[pid]) {
      const degrees = new Map();
      edges.forEach((edge) => {
        if (anchorSet.has(edge.a)) degrees.set(edge.a, (degrees.get(edge.a) || 0) + edge.works);
        if (anchorSet.has(edge.b)) degrees.set(edge.b, (degrees.get(edge.b) || 0) + edge.works);
      });
      pid = [...degrees].sort((a, b) => b[1] - a[1])[0]?.[0] || [...anchorSet][0] || null;
      state.selectedPid = pid;
    }

    const related = edges
      .filter((edge) => edge.a === pid || edge.b === pid)
      .sort((a, b) => b.works - a.works);
    const kept = related.slice(0, state.partnerLimit);
    const neighborIds = [];
    const seen = new Set([pid]);
    kept.forEach((edge) => {
      const other = edge.a === pid ? edge.b : edge.a;
      if (!seen.has(other) && index.people[other]) {
        seen.add(other);
        neighborIds.push(other);
      }
    });
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const radii = [0, Math.min(width, height) * 0.18, Math.min(width, height) * 0.33, Math.min(width, height) * 0.46];
    const byRelation = [[], [], []];
    const relationByPid = new Map();
    const degree = new Map([[pid, kept.reduce((sum, edge) => sum + edge.works, 0)]]);
    kept.forEach((edge) => {
      const other = edge.a === pid ? edge.b : edge.a;
      if (!seen.has(other)) return;
      relationByPid.set(other, edge.rel);
      degree.set(other, edge.works);
      if (!byRelation[edge.rel].includes(other)) byRelation[edge.rel].push(other);
    });

    const nodes = [personNode(pid, anchorSet.has(pid), degree.get(pid), centerX, centerY)];
    const nodeIndex = new Map([[pid, 0]]);
    byRelation.forEach((pids, rel) => {
      pids.forEach((otherPid, itemIndex) => {
        const angle = (Math.PI * 2 * itemIndex) / Math.max(1, pids.length) - Math.PI / 2;
        nodeIndex.set(otherPid, nodes.length);
        nodes.push(personNode(
          otherPid,
          anchorSet.has(otherPid),
          degree.get(otherPid),
          centerX + radii[rel + 1] * Math.cos(angle),
          centerY + radii[rel + 1] * Math.sin(angle),
        ));
      });
    });

    const links = kept
      .filter((edge) => nodeIndex.has(edge.a) && nodeIndex.has(edge.b))
      .map((edge) => ({
        source: nodeIndex.get(edge.a),
        target: nodeIndex.get(edge.b),
        works: edge.works,
        pairs: edge.pairs,
        rel: edge.rel,
      }));

    return {
      nodes,
      links,
      static: true,
      mode: "focus",
      meta: {
        pid,
        ringRadii: radii,
        droppedPartners: Math.max(0, related.length - kept.length),
        totalPartners: related.length,
        filteredEdges: edges,
        anchorSet,
        anchorCount: anchorSet.size,
      },
    };
  }

  function unitEntryAllowed(entry) {
    return new Set(SCOPE_RELS[state.scope]).has(Number(entry[1]));
  }

  function buildUnitGraph() {
    const anchor = anchorByKey.get(state.anchorKey);
    const entries = (index.unit_edges[state.anchorKey] || [])
      .filter(unitEntryAllowed)
      .sort((a, b) => Number(b[2] || 0) - Number(a[2] || 0));
    // "Show partners" (Top N) is the primary cap here — ranked by tie works (entry[2]), already
    // sorted above. Default 50 keeps first load clean; "All" (Infinity) shows every partner.
    const cap = topPartnersCap();
    const kept = entries.slice(0, Number.isFinite(cap) ? cap : entries.length);
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const radii = [Math.min(width, height) * 0.22, Math.min(width, height) * 0.34, Math.min(width, height) * 0.45];
    const byRelation = [[], [], []];
    kept.forEach((entry) => byRelation[Number(entry[1])].push(entry));
    const nodes = [{
      id: state.anchorKey,
      label: compactUnit(anchor?.label || "Anchor"),
      full: anchor?.label || "Anchor",
      kind: "anchor",
      isAnchor: true,
      works: kept.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
      deg: kept.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
    }];
    const links = [];
    byRelation.forEach((relationEntries, rel) => {
      relationEntries.forEach((entry, itemIndex) => {
        const angle = (Math.PI * 2 * itemIndex) / Math.max(1, relationEntries.length) - Math.PI / 2;
        const nodeIndex = nodes.length;
        nodes.push({
          id: `${rel}:${entry[0]}`,
          label: compactUnit(entry[0]),
          full: entry[0],
          kind: "unit-partner",
          rel,
          works: Number(entry[2] || 0),
          deg: Number(entry[2] || 0),
          pairs: Number(entry[3] || 0),
          x: centerX + radii[rel] * Math.cos(angle),
          y: centerY + radii[rel] * Math.sin(angle),
          vx: 0,
          vy: 0,
        });
        links.push({ source: 0, target: nodeIndex, works: Number(entry[2] || 0), rel });
      });
    });
    return {
      nodes,
      links,
      static: true,
      mode: "unit",
      meta: {
        anchorCount: 1,
        droppedPartners: Math.max(0, entries.length - kept.length),
        totalPartners: entries.length,
      },
    };
  }

  function buildGlobalGraph(source, mode) {
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.36;
    const allNodes = source.nodes || [];
    // "Show partners" (Top N) also applies here when it would actually trim something (School
    // has ~7 nodes, Department ~30 — both already under every Top N option except 25, so this
    // is a no-op at the default 50 and doesn't reorder/restyle the existing small-graph layout
    // unless the user explicitly picks a cap below the real node count).
    const cap = topPartnersCap();
    const useCap = Number.isFinite(cap) && cap < allNodes.length;
    const rankedNodes = useCap
      ? [...allNodes].sort((a, b) => Number(b.works || 0) - Number(a.works || 0)).slice(0, cap)
      : allNodes;
    const nodes = rankedNodes.map((node, itemIndex, list) => {
      const angle = (Math.PI * 2 * itemIndex) / Math.max(1, list.length) - Math.PI / 2;
      return {
        ...node,
        kind: "aggregate",
        deg: Number(node.works || 0),
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });
    const nodeIndex = new Map(nodes.map((node, itemIndex) => [String(node.id), itemIndex]));
    const links = (source.edges || [])
      .filter((edge) => nodeIndex.has(String(edge[0])) && nodeIndex.has(String(edge[1])))
      .map((edge) => ({
        source: nodeIndex.get(String(edge[0])),
        target: nodeIndex.get(String(edge[1])),
        works: Number(edge[2] || 0),
        rel: 1,
      }));
    return {
      nodes,
      links,
      static: true,
      mode,
      meta: {
        anchorCount: nodes.length,
        totalPartners: allNodes.length,
        droppedPartners: Math.max(0, allNodes.length - nodes.length),
      },
    };
  }

  function buildCompareGraph() {
    const anchorA = anchorByKey.get(state.compareA);
    const anchorB = anchorByKey.get(state.compareB);
    const eligibleA = (index.unit_edges[state.compareA] || []).filter(unitEntryAllowed)
      .sort((a, b) => Number(b[2] || 0) - Number(a[2] || 0));
    const eligibleB = (index.unit_edges[state.compareB] || []).filter(unitEntryAllowed)
      .sort((a, b) => Number(b[2] || 0) - Number(a[2] || 0));
    const cap = state.compareShowAll ? Infinity : state.compareLimit;
    const entriesA = eligibleA.slice(0, cap);
    const entriesB = eligibleB.slice(0, cap);
    const mapA = new Map(entriesA.map((entry) => [entry[0], entry]));
    const mapB = new Map(entriesB.map((entry) => [entry[0], entry]));
    const shared = [...mapA.keys()].filter((name) => mapB.has(name));
    const onlyA = entriesA.filter((entry) => !mapB.has(entry[0]));
    const onlyB = entriesB.filter((entry) => !mapA.has(entry[0]));
    const width = graphWidth();
    const height = graphHeight();
    const nodes = [
      {
        id: state.compareA,
        label: compactUnit(anchorA?.label || "Anchor A"),
        full: anchorA?.label || "Anchor A",
        kind: "compare-anchor-a",
        isAnchor: true,
        deg: entriesA.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
        works: entriesA.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
        x: width * 0.2,
        y: height * 0.5,
        vx: 0,
        vy: 0,
      },
      {
        id: state.compareB,
        label: compactUnit(anchorB?.label || "Anchor B"),
        full: anchorB?.label || "Anchor B",
        kind: "compare-anchor-b",
        isAnchor: true,
        deg: entriesB.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
        works: entriesB.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
        x: width * 0.8,
        y: height * 0.5,
        vx: 0,
        vy: 0,
      },
    ];
    const links = [];
    const sharedStats = [];

    shared.forEach((name, itemIndex) => {
      const entryA = mapA.get(name);
      const entryB = mapB.get(name);
      const y = ((itemIndex + 1) * height) / (shared.length + 1);
      const nodeIndex = nodes.length;
      nodes.push({
        id: `shared:${name}`,
        label: compactUnit(name),
        full: name,
        kind: "compare-shared",
        rel: Math.min(Number(entryA[1]), Number(entryB[1])),
        deg: Number(entryA[2] || 0) + Number(entryB[2] || 0),
        works: Number(entryA[2] || 0) + Number(entryB[2] || 0),
        x: width * 0.5,
        y,
        vx: 0,
        vy: 0,
      });
      links.push({ source: 0, target: nodeIndex, works: Number(entryA[2] || 0), rel: Number(entryA[1]) });
      links.push({ source: 1, target: nodeIndex, works: Number(entryB[2] || 0), rel: Number(entryB[1]) });
      sharedStats.push({ name, a: Number(entryA[2] || 0), b: Number(entryB[2] || 0) });
    });

    const placeUnique = (entries, side, anchorIndex) => {
      const centerX = side === "a" ? width * 0.2 : width * 0.8;
      const ring = Math.min(width * 0.17, height * 0.38);
      entries.forEach((entry, itemIndex) => {
        const angle = (Math.PI * 2 * itemIndex) / Math.max(1, entries.length) - Math.PI / 2;
        const nodeIndex = nodes.length;
        nodes.push({
          id: `${side}:${entry[0]}`,
          label: compactUnit(entry[0]),
          full: entry[0],
          kind: "compare-unique",
          side,
          rel: Number(entry[1]),
          deg: Number(entry[2] || 0),
          works: Number(entry[2] || 0),
          x: centerX + ring * Math.cos(angle),
          y: height * 0.5 + ring * Math.sin(angle),
          vx: 0,
          vy: 0,
        });
        links.push({ source: anchorIndex, target: nodeIndex, works: Number(entry[2] || 0), rel: Number(entry[1]) });
      });
    };
    placeUnique(onlyA, "a", 0);
    placeUnique(onlyB, "b", 1);

    sharedStats.sort((a, b) => (b.a + b.b) - (a.a + a.b));
    return {
      nodes,
      links,
      static: true,
      mode: "compare",
      meta: {
        anchorA,
        anchorB,
        shared: sharedStats,
        totalA: entriesA.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
        totalB: entriesB.reduce((sum, entry) => sum + Number(entry[2] || 0), 0),
        eligibleA: eligibleA.length,
        eligibleB: eligibleB.length,
        shownA: entriesA.length,
        shownB: entriesB.length,
        hiddenA: Math.max(0, eligibleA.length - entriesA.length),
        hiddenB: Math.max(0, eligibleB.length - entriesB.length),
        compareLimit: state.compareLimit,
        showAll: state.compareShowAll,
        droppedPartners: Math.max(0, eligibleA.length - entriesA.length)
          + Math.max(0, eligibleB.length - entriesB.length),
      },
    };
  }

  function fillPathSelects(edges) {
    const pids = new Set();
    edges.forEach((edge) => {
      if (index.people[edge.a]?.[1] !== 4) pids.add(edge.a);
      if (index.people[edge.b]?.[1] !== 4) pids.add(edge.b);
    });
    const sorted = [...pids].sort((a, b) => index.people[a][0].localeCompare(index.people[b][0]));
    if (!sorted.includes(state.pathStart)) state.pathStart = sorted[0] || null;
    if (!sorted.includes(state.pathEnd) || state.pathEnd === state.pathStart) state.pathEnd = sorted[1] || sorted[0] || null;
    const options = sorted.map((pid) => (
      `<option value="${esc(pid)}">${esc(index.people[pid][0])}</option>`
    )).join("");
    $("pathStart").innerHTML = options;
    $("pathEnd").innerHTML = options;
    $("pathStart").value = state.pathStart || "";
    $("pathEnd").value = state.pathEnd || "";
  }

  function buildPathGraph(edges) {
    fillPathSelects(edges);
    const start = state.pathStart;
    const end = state.pathEnd;
    if (!start || !end) return { ...emptyGraph(), mode: "path", meta: { error: "Choose two scholars." } };
    if (start === end) return { ...emptyGraph(), mode: "path", meta: { error: "Choose two different scholars." } };

    const adjacency = new Map();
    const edgeByPair = new Map();
    edges.forEach((edge) => {
      if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
      if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
      adjacency.get(edge.a).push(edge.b);
      adjacency.get(edge.b).push(edge.a);
      edgeByPair.set([edge.a, edge.b].sort().join(":"), edge);
    });
    const queue = [start];
    const previous = new Map([[start, null]]);
    while (queue.length && !previous.has(end)) {
      const current = queue.shift();
      (adjacency.get(current) || []).forEach((next) => {
        if (!previous.has(next)) {
          previous.set(next, current);
          queue.push(next);
        }
      });
    }
    if (!previous.has(end)) {
      return {
        ...emptyGraph(),
        mode: "path",
        meta: { error: "No collaboration path is present in the selected anchor and filters." },
      };
    }

    const path = [];
    let current = end;
    while (current) {
      path.push(current);
      current = previous.get(current);
    }
    path.reverse();
    const width = graphWidth();
    const height = graphHeight();
    const nodes = path.map((pid, itemIndex) => personNode(
      pid,
      (index.anchor_pids[state.anchorKey] || []).includes(pid),
      1,
      ((itemIndex + 1) * width) / (path.length + 1),
      height * 0.5 + (itemIndex % 2 ? 34 : -34),
    ));
    const links = [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const edge = edgeByPair.get([path[i], path[i + 1]].sort().join(":"));
      links.push({ source: i, target: i + 1, works: edge.works, rel: edge.rel });
    }
    return {
      nodes,
      links,
      static: true,
      mode: "path",
      meta: { path, filteredEdges: edges, anchorCount: 0 },
    };
  }

  function buildBridgeGraph(edges, anchorSet) {
    const currentAnchor = state.anchorKey;
    const scores = new Map();
    const sameKindUnits = new Set(index.anchors
      .filter((anchor) => anchor.kind === "unit" && anchor.unit_kind === state.unitKind)
      .map((anchor) => anchor.key));

    const addBridge = (scholarPid, partnerPid, edge) => {
      if (!anchorSet.has(scholarPid)) return;
      const partnerUnits = (memberships.get(partnerPid) || [])
        .filter((key) => key !== currentAnchor && sameKindUnits.has(key));
      if (!partnerUnits.length) return;
      if (!scores.has(scholarPid)) {
        scores.set(scholarPid, {
          pid: scholarPid,
          units: new Set(),
          collaborators: new Set(),
          works: 0,
          unitWorks: new Map(),
        });
      }
      const score = scores.get(scholarPid);
      score.collaborators.add(partnerPid);
      score.works += edge.works;
      partnerUnits.forEach((key) => {
        score.units.add(key);
        score.unitWorks.set(key, (score.unitWorks.get(key) || 0) + edge.works);
      });
    };

    edges.filter((edge) => edge.rel === 1).forEach((edge) => {
      addBridge(edge.a, edge.b, edge);
      addBridge(edge.b, edge.a, edge);
    });

    const ranking = [...scores.values()]
      .sort((a, b) => b.units.size - a.units.size || b.works - a.works)
      .slice(0, Math.min(30, state.topAnchors));
    const graphPeople = ranking.slice(0, 12);
    const unitFrequency = new Map();
    graphPeople.forEach((score) => score.units.forEach((key) => {
      unitFrequency.set(key, (unitFrequency.get(key) || 0) + 1);
    }));
    const unitKeys = [...unitFrequency]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([key]) => key);
    const unitSet = new Set(unitKeys);
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const peopleRadius = Math.min(width, height) * 0.19;
    const unitRadius = Math.min(width, height) * 0.42;
    const nodes = [];
    const nodeIndex = new Map();

    graphPeople.forEach((score, itemIndex) => {
      const angle = (Math.PI * 2 * itemIndex) / Math.max(1, graphPeople.length) - Math.PI / 2;
      nodeIndex.set(`p:${score.pid}`, nodes.length);
      nodes.push(personNode(
        score.pid,
        true,
        score.works,
        centerX + peopleRadius * Math.cos(angle),
        centerY + peopleRadius * Math.sin(angle),
      ));
    });
    unitKeys.forEach((key, itemIndex) => {
      const anchor = anchorByKey.get(key);
      const angle = (Math.PI * 2 * itemIndex) / Math.max(1, unitKeys.length) - Math.PI / 2;
      nodeIndex.set(`u:${key}`, nodes.length);
      nodes.push({
        id: key,
        label: compactUnit(anchor?.label || key),
        full: anchor?.label || key,
        kind: "bridge-unit",
        deg: unitFrequency.get(key) || 1,
        works: unitFrequency.get(key) || 1,
        x: centerX + unitRadius * Math.cos(angle),
        y: centerY + unitRadius * Math.sin(angle),
        vx: 0,
        vy: 0,
      });
    });
    const links = [];
    graphPeople.forEach((score) => {
      score.units.forEach((key) => {
        if (!unitSet.has(key)) return;
        links.push({
          source: nodeIndex.get(`p:${score.pid}`),
          target: nodeIndex.get(`u:${key}`),
          works: score.unitWorks.get(key) || 1,
          rel: 1,
        });
      });
    });
    return {
      nodes,
      links,
      static: true,
      mode: "bridges",
      meta: {
        ranking,
        filteredEdges: edges,
        anchorSet,
        anchorCount: anchorSet.size,
      },
    };
  }

  async function refresh() {
    const requestId = ++refreshId;
    cancelAnimationFrame(simulationFrame);
    simulationFrame = null;
    showLoading();
    syncControls();
    syncUrl();
    hoverGraphIndex = -1;
    selectedGraphIndex = -1;

    try {
      let graph;
      currentFilteredEdges = [];
      activePayload = null;

      if (state.view === "compare") {
        graph = buildCompareGraph();
      } else if (state.view === "explore" && state.level === "school") {
        graph = buildGlobalGraph(index.school_graph, "school");
      } else if (state.view === "explore" && state.level === "department") {
        graph = buildGlobalGraph(index.dept_graph, "department");
      } else if (state.view === "explore" && state.level === "unit") {
        graph = buildUnitGraph();
      } else {
        activePayload = await loadPayload(state.anchorKey);
        if (requestId !== refreshId) return;
        const anchorSet = new Set(index.anchor_pids[state.anchorKey] || []);
        currentFilteredEdges = filteredEdges(activePayload, anchorSet);
        if (state.view === "focus") {
          graph = buildFocusGraph(currentFilteredEdges, anchorSet, state.selectedPid);
          state.selectedPid = graph.meta.pid || state.selectedPid;
        } else if (state.view === "path") {
          graph = buildPathGraph(currentFilteredEdges);
        } else if (state.view === "bridges") {
          graph = buildBridgeGraph(currentFilteredEdges, anchorSet);
        } else {
          graph = buildPersonGraph(currentFilteredEdges, anchorSet);
        }
      }

      if (requestId !== refreshId) return;
      activeGraph = graph;
      panX = 0;
      panY = 0;
      zoom = 1;
      hideLoading();
      renderGraphState();
      if (activeGraph.static) {
        fitGraph(false);
      } else {
        startSimulation();
      }
      syncUrl();
    } catch (error) {
      if (requestId !== refreshId) return;
      hideLoading();
      activeGraph = emptyGraph();
      $("graphEmpty").textContent = error.message || "Unable to load the network.";
      $("graphEmpty").hidden = false;
      $("summaryStatus").textContent = "Network unavailable";
      console.error(error);
    }
  }

  function nodeRadius(node) {
    if (node.kind === "compare-anchor-a" || node.kind === "compare-anchor-b" || node.kind === "anchor") {
      return Math.max(16, Math.min(30, 12 + Math.log((node.deg || 1) + 1) * 2.2));
    }
    if (node.kind !== "person") return Math.max(7, Math.min(24, 5 + Math.log((node.deg || 1) + 1) * 2.8));
    return Math.max(4, Math.min(16, 4 + Math.sqrt(node.deg || 0) * 0.65));
  }

  function startSimulation() {
    let alpha = 1;
    const step = () => {
      for (let pass = 0; pass < 2; pass += 1) simulate(alpha);
      draw();
      alpha *= 0.955;
      if (alpha > 0.02) simulationFrame = requestAnimationFrame(step);
      else simulationFrame = null;
    };
    simulationFrame = requestAnimationFrame(step);
  }

  function simulate(alpha) {
    const nodes = activeGraph.nodes;
    const links = activeGraph.links;
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const charge = nodes.length > 140 ? 130 : 210;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 1) {
          dx = (hashFraction(`${a.id}:${b.id}`) - 0.5) * 2;
          dy = (hashFraction(`${b.id}:${a.id}`) - 0.5) * 2;
          distanceSquared = dx * dx + dy * dy || 1;
        }
        const force = (charge * alpha) / distanceSquared;
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }

    links.forEach((link) => {
      const a = nodes[link.source];
      const b = nodes[link.target];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = activeGraph.mode === "person" ? (link.rel === 0 ? 58 : 90) : 120;
      const force = (distance - target) * 0.0027 * alpha;
      a.vx += dx * force;
      a.vy += dy * force;
      b.vx -= dx * force;
      b.vy -= dy * force;
    });

    nodes.forEach((node) => {
      if (node.pinned) return;
      const ringTarget = node.kind === "person" && !node.isAnchor
        ? Math.min(width, height) * 0.35
        : Math.min(width, height) * 0.18;
      const dx = node.x - centerX;
      const dy = node.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const ringForce = (distance - ringTarget) * 0.0008 * alpha;
      node.vx -= dx * ringForce;
      node.vy -= dy * ringForce;
      node.vx += (centerX - node.x) * 0.00025 * alpha;
      node.vy += (centerY - node.y) * 0.00025 * alpha;
      node.vx *= 0.86;
      node.vy *= 0.86;
      node.x += node.vx;
      node.y += node.vy;
      const padding = nodeRadius(node) + 8;
      node.x = Math.max(padding, Math.min(width - padding, node.x));
      node.y = Math.max(padding, Math.min(height - padding, node.y));
    });
  }

  function drawZones() {
    if (activeGraph.mode !== "focus" || !activeGraph.meta.ringRadii) return;
    const width = graphWidth();
    const height = graphHeight();
    const centerX = width / 2;
    const centerY = height / 2;
    const labels = ["Within unit", "Across MIT", "External"];
    const radii = activeGraph.meta.ringRadii.slice(1);
    radii.slice().reverse().forEach((radius, reverseIndex) => {
      const rel = 2 - reverseIndex;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
      ctx.fillStyle = `${REL_COLORS[rel]}12`;
      ctx.fill();
      ctx.strokeStyle = `${REL_COLORS[rel]}55`;
      ctx.setLineDash(rel === 2 ? [6, 5] : []);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = REL_COLORS[rel];
      ctx.font = "600 10px 'Open Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[rel], centerX, centerY - radius - 25);
    });
  }

  function nodeColor(node) {
    if (node.kind === "person") return RANK_COLORS[node.rank] || RANK_COLORS[3];
    if (node.kind === "compare-anchor-a") return "#0066b4";
    if (node.kind === "compare-anchor-b") return "#c04040";
    if (node.kind === "anchor") return "#0066b4";
    if (node.kind === "aggregate") return SCHOOL_COLORS[node.school] || "#607080";
    if (node.kind === "bridge-unit") return "#6a7a8a";
    return REL_COLORS[node.rel] || "#6a7a8a";
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!activeGraph.nodes.length) return;
    drawZones();
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const activeIndex = hoverGraphIndex >= 0 ? hoverGraphIndex : selectedGraphIndex;
    activeGraph.links.forEach((link) => {
      const source = activeGraph.nodes[link.source];
      const target = activeGraph.nodes[link.target];
      if (!source || !target) return;
      const connected = activeIndex < 0 || link.source === activeIndex || link.target === activeIndex;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = activeGraph.mode === "school" || activeGraph.mode === "department"
        ? "#8aabc4"
        : REL_COLORS[link.rel] || "#8aabc4";
      ctx.lineWidth = Math.max(0.7, Math.min(4.5, 0.5 + Math.log((link.works || 0) + 1) / Math.log(4)));
      ctx.globalAlpha = connected ? (activeIndex >= 0 ? 0.9 : 0.38) : 0.045;
      ctx.stroke();
    });

    activeGraph.nodes.forEach((node, nodeIndex) => {
      const radius = nodeRadius(node);
      const selected = nodeIndex === selectedGraphIndex || (node.pid && node.pid === state.selectedPid);
      const hovered = nodeIndex === hoverGraphIndex;
      const connected = activeIndex < 0 || nodeIndex === activeIndex || activeGraph.links.some((link) => (
        (link.source === activeIndex && link.target === nodeIndex)
        || (link.target === activeIndex && link.source === nodeIndex)
      ));
      ctx.globalAlpha = connected ? 1 : 0.28;
      if (selected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(5, 36, 72, 0.18)";
        ctx.fill();
      } else if (hovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 102, 180, 0.16)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(node);
      ctx.fill();
      ctx.setLineDash(node.kind === "person" && node.rank === 4 ? [2, 2] : []);
      ctx.strokeStyle = node.isAnchor ? "#052448" : "#ffffff";
      ctx.lineWidth = node.isAnchor ? 2.2 : 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    });

    const dense = activeGraph.nodes.length > 70 && zoom <= 1.3
      && !["focus", "path", "compare", "bridges", "unit"].includes(activeGraph.mode);
    const maxDegree = activeGraph.nodes.reduce((max, node) => Math.max(max, node.deg || 0), 1);
    activeGraph.nodes.forEach((node, nodeIndex) => {
      if (dense && !node.isAnchor && nodeIndex !== hoverGraphIndex && nodeIndex !== selectedGraphIndex
        && (node.deg || 0) < maxDegree * 0.18) return;
      const radius = nodeRadius(node);
      const label = node.label || node.full || "";
      ctx.globalAlpha = node.isAnchor || nodeIndex === selectedGraphIndex ? 0.98 : 0.74;
      ctx.fillStyle = "#052448";
      ctx.font = `${node.isAnchor ? "700" : "600"} ${activeGraph.mode === "person" ? 9 : 10}px 'Open Sans', sans-serif`;
      ctx.textAlign = node.kind === "anchor" || node.kind.startsWith("compare-anchor") ? "center" : "left";
      const x = ctx.textAlign === "center" ? node.x : node.x + radius + 3;
      const y = ctx.textAlign === "center" ? node.y + radius + 14 : node.y + 3;
      ctx.fillText(label, x, y, activeGraph.mode === "person" ? 130 : 180);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function fitGraph(redraw = true) {
    if (!activeGraph.nodes.length) return;
    const width = graphWidth();
    const height = graphHeight();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    activeGraph.nodes.forEach((node) => {
      const radius = nodeRadius(node) + 28;
      minX = Math.min(minX, node.x - radius);
      maxX = Math.max(maxX, node.x + radius);
      minY = Math.min(minY, node.y - radius);
      maxY = Math.max(maxY, node.y + radius);
    });
    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);
    zoom = Math.max(0.18, Math.min(2, Math.min((width - 40) / graphW, (height - 40) / graphH)));
    panX = width / 2 - zoom * (minX + maxX) / 2;
    panY = height / 2 - zoom * (minY + maxY) / 2;
    if (redraw) draw();
  }

  function resetView() {
    panX = 0;
    panY = 0;
    zoom = 1;
    activeGraph.nodes.forEach((node) => { node.pinned = false; });
    if (!activeGraph.static) startSimulation();
    else fitGraph();
  }

  function graphStatus() {
    const anchor = anchorByKey.get(state.anchorKey);
    if (activeGraph.mode === "focus") {
      return `${index.people[state.selectedPid]?.[0] || "Scholar"} collaboration neighborhood`;
    }
    if (activeGraph.mode === "compare") {
      return `${activeGraph.meta.anchorA?.label || "Anchor A"} vs ${activeGraph.meta.anchorB?.label || "Anchor B"}`;
    }
    if (activeGraph.mode === "path") return activeGraph.meta.error || "Shortest collaboration path";
    if (activeGraph.mode === "bridges") return `Bridge scholars for ${anchor?.label || "selected anchor"}`;
    if (activeGraph.mode === "school") return "College / School collaboration network";
    if (activeGraph.mode === "department") return "Department collaboration network";
    if (activeGraph.mode === "unit") return `${anchor?.label || "Anchor"} partner network`;
    return `${anchor?.label || "Anchor"} scholar network`;
  }

  function renderGraphState() {
    const nodeCount = activeGraph.nodes.length;
    const edgeCount = activeGraph.links.length;
    const anchorCount = activeGraph.meta.anchorCount
      ?? activeGraph.nodes.filter((node) => node.isAnchor).length;
    $("summaryStatus").textContent = graphStatus();
    $("summaryAnchorLabel").textContent = activeGraph.mode === "compare"
      ? "Compared anchors"
      : "Anchor scholars";
    $("summaryScholars").textContent = number(anchorCount);
    $("summaryNodes").textContent = number(nodeCount);
    $("summaryEdges").textContent = number(edgeCount);

    $("summaryAnchorItem").title = activeGraph.mode === "compare"
      ? "Scholars anchoring each side of the comparison."
      : "Scholars from the selected anchor unit shown in this graph, capped by the “Top anchor scholars” filter.";
    $("summaryNodesItem").title = "Everyone drawn in this graph: anchor scholars plus the collaborators who passed the current Scope and Partner limit filters.";
    $("summaryEdgesItem").title = "Collaboration lines between visible people — one line per collaborator pair, not per publication. Color shows relationship: green = within the unit, gold = across MIT units, purple = external institution.";

    const droppedAnchors = activeGraph.meta.droppedAnchors || 0;
    const droppedPartners = activeGraph.meta.droppedPartners || 0;
    const dropped = droppedAnchors + droppedPartners;
    $("summaryBadge").hidden = true;
    $("showHiddenBtn").hidden = true;
    if (activeGraph.mode === "compare") {
      const meta = activeGraph.meta;
      const hiddenA = meta.hiddenA || 0;
      const hiddenB = meta.hiddenB || 0;
      const hiddenTotal = hiddenA + hiddenB;
      $("summaryBadge").hidden = false;
      if (hiddenTotal) {
        $("summaryBadge").textContent = `Top ${number(meta.compareLimit)} per anchor \u00b7 ${number(hiddenA)} hidden from A \u00b7 ${number(hiddenB)} hidden from B`;
        $("showHiddenBtn").textContent = `Show all ${number(hiddenTotal)}`;
        $("showHiddenBtn").hidden = false;
      } else {
        $("summaryBadge").textContent = `All ${number((meta.eligibleA || 0) + (meta.eligibleB || 0))} anchor-partner entries shown`;
      }
    } else if (dropped) {
      $("summaryBadge").hidden = false;
      const parts = [];
      if (droppedAnchors) parts.push(`${number(droppedAnchors)} scholars hidden`);
      if (droppedPartners) parts.push(`${number(droppedPartners)} partners hidden`);
      $("summaryBadge").textContent = parts.join(" \u00b7 ");
      if (activeGraph.meta.totalAnchors != null || activeGraph.meta.totalPartners != null) {
        $("showHiddenBtn").textContent = `Show all ${number(dropped)}`;
        $("showHiddenBtn").hidden = false;
      }
    }

    $("graphA11ySummary").textContent = `${graphStatus()}. ${nodeCount} visible nodes and ${edgeCount} ties. An equivalent selectable people list is available in the details panel.`;
    $("graphEmpty").hidden = nodeCount > 0;
    if (!nodeCount) $("graphEmpty").textContent = activeGraph.meta.error || "No network ties match the selected filters.";
    renderLegend();
    renderDrawer();
    draw();
  }

  function renderLegend() {
    let html = "";
    if (activeGraph.mode === "school" || activeGraph.mode === "department") {
      html = `<div class="legend-title">Node color - College / School</div><div class="legend-grid">${Object.entries(SCHOOL_COLORS).map(([name, color]) => (
        `<div class="legend-row"><span class="legend-dot" style="background:${color}"></span>${esc(compactUnit(name))}</div>`
      )).join("")}</div>`;
    } else if (activeGraph.mode === "bridges") {
      html = "<div class=\"legend-title\">Bridge reach</div><div class=\"legend-grid\"><div class=\"legend-row\"><span class=\"legend-dot\"></span>Scholar</div><div class=\"legend-row\"><span class=\"legend-dot other\"></span>MIT unit</div></div>";
    } else {
      html = `<div class="legend-title">Relationship</div><div class="legend-grid">
        <div class="legend-row"><span class="legend-line"></span>Within unit</div>
        <div class="legend-row"><span class="legend-line across"></span>Across MIT</div>
        <div class="legend-row"><span class="legend-line inter"></span>External</div>
        <div class="legend-row"><span class="legend-dot external"></span>External person</div>
      </div>`;
    }
    $("legend").innerHTML = html;
  }

  function visiblePeople() {
    return activeGraph.nodes
      .filter((node) => node.kind === "person")
      .sort((a, b) => (b.deg || 0) - (a.deg || 0));
  }

  function connectionsFor(pid) {
    if (!pid || !currentFilteredEdges.length) return [];
    return currentFilteredEdges
      .filter((edge) => edge.a === pid || edge.b === pid)
      .map((edge) => {
        const otherPid = edge.a === pid ? edge.b : edge.a;
        return {
          ...edge,
          pid: otherPid,
          person: index.people[otherPid] || ["Unknown", 3, ""],
        };
      })
      .sort((a, b) => b.works - a.works);
  }

  function relationPill(rel) {
    const cls = rel === 1 ? " across" : rel === 2 ? " inter" : "";
    return `<span class="rel-pill${cls}">${esc(REL_NAMES[rel])}</span>`;
  }

  function peopleRows(people, limit = 80) {
    return people.slice(0, limit).map((item) => {
      const pid = item.pid || item.id;
      const person = index.people[pid] || [item.full || item.label || "Unknown", 3, ""];
      const value = item.works ?? item.deg ?? 0;
      const suffix = item.rel == null ? `<strong>${number(value)}</strong>` : relationPill(item.rel);
      return `<li><button class="person-row" type="button" data-focus-pid="${esc(pid)}">
        <span><strong>${esc(person[0])}</strong><span>${esc(person[2] || RANK_NAMES[person[1]] || "MIT scholar")}</span></span>
        ${suffix}
      </button></li>`;
    }).join("");
  }

  function setDrawerHeading(title, subtitle, closeVisible = false) {
    $("drawerHeading").textContent = title;
    $("drawerSubheading").textContent = subtitle;
    $("drawerClose").hidden = !closeVisible;
  }

  function renderNetworkOverview() {
    const people = visiblePeople();
    const status = graphStatus();
    return `<section class="drawer-section">
      <div class="metric-grid">
        <div class="metric"><strong>${number(activeGraph.nodes.length)}</strong><span>Visible nodes</span></div>
        <div class="metric"><strong>${number(activeGraph.links.length)}</strong><span>Ties</span></div>
        <div class="metric"><strong>${number(people.length)}</strong><span>People</span></div>
      </div>
    </section>
    <section class="drawer-section">
      <h3>Current view</h3>
      <p>${esc(status)}</p>
    </section>
    <section class="drawer-section">
      <h3>Visible scholars</h3>
      ${people.length ? `<ul class="people-list">${peopleRows(people, 2000)}</ul>` : '<p class="empty-copy">No scholars in this view.</p>'}
    </section>`;
  }

  function personDescriptor(connections, relationTotals) {
    const total = relationTotals.reduce((sum, value) => sum + value, 0) || 1;
    const repeatRate = connections.length
      ? connections.filter((connection) => connection.works > 1).length / connections.length
      : 0;
    if (relationTotals[1] / total >= 0.45) return "Strong cross-unit connector across MIT.";
    if (relationTotals[2] / total >= 0.5) return "Collaboration profile is primarily external to MIT.";
    if (repeatRate >= 0.45) return "Collaboration profile is concentrated in repeat partnerships.";
    return "Collaboration profile is centered on the selected unit.";
  }

  function renderPersonOverview(pid, connections) {
    const relationTotals = [0, 0, 0];
    connections.forEach((connection) => { relationTotals[connection.rel] += connection.works; });
    const totalWorks = relationTotals.reduce((sum, value) => sum + value, 0);
    const repeatRate = connections.length
      ? Math.round(100 * connections.filter((connection) => connection.works > 1).length / connections.length)
      : 0;
    const withinEnd = totalWorks ? (100 * relationTotals[0]) / totalWorks : 0;
    const acrossEnd = totalWorks ? withinEnd + (100 * relationTotals[1]) / totalWorks : withinEnd;
    const donutStyle = totalWorks
      ? `background:conic-gradient(var(--within) 0 ${withinEnd}%,var(--across) ${withinEnd}% ${acrossEnd}%,var(--inter) ${acrossEnd}% 100%)`
      : "background:var(--line)";

    const institutions = new Map();
    connections.filter((connection) => connection.rel === 2).forEach((connection) => {
      const institution = connection.person[2] || "External institution";
      institutions.set(institution, (institutions.get(institution) || 0) + connection.works);
    });
    const topInstitutions = [...institutions]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return `<section class="drawer-section">
      <div class="metric-grid">
        <div class="metric"><strong>${number(connections.length)}</strong><span>Collaborators</span></div>
        <div class="metric"><strong>${number(totalWorks)}</strong><span>Work-links</span></div>
        <div class="metric"><strong>${repeatRate}%</strong><span>Repeat partners</span></div>
      </div>
    </section>
    <section class="drawer-section">
      <h3>Relationship fingerprint</h3>
      <div class="fingerprint">
        <div class="donut" data-total="${number(totalWorks)}" style="${donutStyle}"></div>
        <div class="relation-list">
          ${relationTotals.map((value, rel) => `<div class="relation-row"><span class="relation-label"><span class="relation-swatch${rel === 1 ? " across" : rel === 2 ? " inter" : ""}"></span>${REL_NAMES[rel]}</span><strong>${number(value)}</strong></div>`).join("")}
        </div>
      </div>
    </section>
    <section class="drawer-section"><p class="descriptor">${esc(personDescriptor(connections, relationTotals))}</p></section>
    ${topInstitutions.length ? `<section class="drawer-section"><h3>Top external institutions</h3><div class="rank-list">${topInstitutions.map(([name, value]) => `<div class="rank-row"><span>${esc(name)}</span><strong>${number(value)}</strong></div>`).join("")}</div></section>` : ""}
    <a class="drawer-action" href="details_v2.html?pid=${encodeURIComponent(pid)}&anchor=${encodeURIComponent(state.anchorKey)}&scope=${encodeURIComponent(state.scope)}">Open full collaboration details</a>`;
  }

  function renderPersonPeople(connections) {
    if (!connections.length) return '<p class="empty-copy">No collaborators match the selected filters.</p>';
    return `<section class="drawer-section"><h3>Collaborators</h3><ul class="people-list">${connections.slice(0, 500).map((connection) => (
      `<li><button class="person-row" type="button" data-focus-pid="${esc(connection.pid)}">
        <span><strong>${esc(connection.person[0])}</strong><span>${esc(connection.person[2] || RANK_NAMES[connection.person[1]] || "")}</span></span>
        <span>${relationPill(connection.rel)} <strong>${number(connection.works)}</strong></span>
      </button></li>`
    )).join("")}</ul></section>`;
  }

  async function ensureWorksMeta() {
    if (worksMeta) return worksMeta;
    worksMeta = await fetchJson(WORKS_URL);
    return worksMeta;
  }

  function renderPersonWorks(pid, connections) {
    if (!worksMeta) {
      ensureWorksMeta().then(() => {
        if (state.selectedPid === pid && state.drawerTab === "works") renderDrawer();
      }).catch((error) => {
        console.error(error);
        showToast("Unable to load work titles");
      });
      return '<p class="empty-copy">Loading collaborative works...</p>';
    }
    const rows = [];
    const seen = new Set();
    connections.forEach((connection) => {
      const pairKey = [pid, connection.pid].sort().join(":");
      const workIds = activePayload?.edge_wids?.[pairKey] || [];
      workIds.forEach((workId) => {
        if (seen.has(workId) || !worksMeta[workId] || rows.length >= 60) return;
        seen.add(workId);
        const [title, year, typeIndex] = worksMeta[workId];
        rows.push({ title, year, type: TYPE_LABELS[typeIndex] || "Work", collaborator: connection.person[0] });
      });
    });
    if (!rows.length) return '<p class="empty-copy">No work titles are available for this selection.</p>';
    return `<section class="drawer-section"><h3>Collaborative works</h3><div class="work-list">${rows.map((row) => (
      `<div class="work-row"><span><strong>${esc(row.title)}</strong><br><span class="muted">${esc(row.type)} · ${esc(row.collaborator)}${row.year ? ` · ${esc(row.year)}` : ""}</span></span></div>`
    )).join("")}</div></section>`;
  }

  function renderPersonDrawer(pid) {
    const person = index.people[pid] || ["Unknown scholar", 3, ""];
    const connections = connectionsFor(pid);
    setDrawerHeading(person[0], `${RANK_NAMES[person[1]] || "MIT scholar"}${person[2] ? ` · ${person[2]}` : ""}`, true);
    if (state.drawerTab === "people") return renderPersonPeople(connections);
    if (state.drawerTab === "works") return renderPersonWorks(pid, connections);
    return renderPersonOverview(pid, connections);
  }

  function renderCompareDrawer() {
    const meta = activeGraph.meta;
    setDrawerHeading("Anchor comparison", `${meta.anchorA?.label || "Anchor A"} vs ${meta.anchorB?.label || "Anchor B"}`);
    if (state.drawerTab === "people") {
      return `<section class="drawer-section"><h3>Shared partners</h3>${meta.shared.length ? `<div class="rank-list">${meta.shared.map((item) => `<div class="rank-row"><span>${esc(item.name)}</span><strong>${number(item.a)} / ${number(item.b)}</strong></div>`).join("")}</div>` : '<p class="empty-copy">No shared partners in the selected scope.</p>'}</section>`;
    }
    if (state.drawerTab === "works") {
      return '<p class="empty-copy">Work-level detail is available from a selected scholar network.</p>';
    }
    return `<section class="drawer-section"><div class="metric-grid">
      <div class="metric"><strong>${number(meta.shared.length)}</strong><span>Shared partners</span></div>
      <div class="metric"><strong>${number(meta.shownA)} / ${number(meta.eligibleA)}</strong><span>A partners shown</span></div>
      <div class="metric"><strong>${number(meta.shownB)} / ${number(meta.eligibleB)}</strong><span>B partners shown</span></div>
    </div></section>
    <section class="drawer-section"><h3>Strongest shared partners</h3>${meta.shared.length ? `<div class="rank-list">${meta.shared.slice(0, 10).map((item) => `<div class="rank-row"><span>${esc(item.name)}</span><strong>${number(item.a + item.b)}</strong></div>`).join("")}</div>` : '<p class="empty-copy">No shared partners in the selected scope.</p>'}</section>`;
  }

  function renderPathDrawer() {
    setDrawerHeading("Collaboration path", anchorByKey.get(state.anchorKey)?.label || "Selected anchor");
    if (activeGraph.meta.error) return `<p class="empty-copy">${esc(activeGraph.meta.error)}</p>`;
    const path = activeGraph.meta.path || [];
    return `<section class="drawer-section"><div class="metric-grid">
      <div class="metric"><strong>${number(Math.max(0, path.length - 1))}</strong><span>Steps</span></div>
      <div class="metric"><strong>${number(path.length)}</strong><span>People</span></div>
      <div class="metric"><strong>${number(activeGraph.links.reduce((sum, link) => sum + link.works, 0))}</strong><span>Work-links</span></div>
    </div></section>
    <section class="drawer-section"><h3>Path</h3><ol class="path-list">${path.map((pid, itemIndex) => `<li><button class="person-row" type="button" data-focus-pid="${esc(pid)}"><span><strong>${itemIndex + 1}. ${esc(index.people[pid]?.[0] || pid)}</strong><span>${esc(index.people[pid]?.[2] || "")}</span></span></button></li>`).join("")}</ol></section>`;
  }

  function renderBridgeDrawer() {
    const ranking = activeGraph.meta.ranking || [];
    setDrawerHeading("Bridge scholars", anchorByKey.get(state.anchorKey)?.label || "Selected anchor");
    if (!ranking.length) return '<p class="empty-copy">No cross-unit bridge scholars match the selected filters.</p>';
    return `<section class="drawer-section"><div class="metric-grid">
      <div class="metric"><strong>${number(ranking.length)}</strong><span>Ranked scholars</span></div>
      <div class="metric"><strong>${number(ranking[0]?.units.size || 0)}</strong><span>Top unit reach</span></div>
      <div class="metric"><strong>${number(ranking.reduce((sum, item) => sum + item.works, 0))}</strong><span>Across links</span></div>
    </div></section>
    <section class="drawer-section"><h3>Distinct-unit reach</h3><ol class="rank-list">${ranking.map((item, itemIndex) => `<li><button class="rank-button" type="button" data-focus-pid="${esc(item.pid)}"><span><strong>${itemIndex + 1}. ${esc(index.people[item.pid]?.[0] || item.pid)}</strong><span>${number(item.collaborators.size)} collaborators · ${number(item.works)} work-links</span></span><strong>${number(item.units.size)}</strong></button></li>`).join("")}</ol></section>`;
  }

  function partnerNodeMatchesPid(pid, node) {
    if (node.rel === 2) {
      const person = index.people[pid];
      return !!person && String(person[2] || "").trim() === String(node.full || "").trim();
    }
    const targetKeys = new Set(index.anchors
      .filter((anchor) => anchor.kind === "unit" && anchor.label === node.full)
      .map((anchor) => anchor.key));
    if (!targetKeys.size) return false;
    return (memberships.get(pid) || []).some((key) => targetKeys.has(key));
  }

  function tieGroupsForNode(node) {
    if (node.kind === "unit-partner") {
      return [{ heading: null, anchorKey: state.anchorKey }];
    }
    if (node.kind === "compare-unique") {
      return [{ heading: null, anchorKey: node.side === "a" ? state.compareA : state.compareB }];
    }
    if (node.kind === "compare-shared") {
      return [
        { heading: compactUnit(anchorByKey.get(state.compareA)?.label || "Anchor A"), anchorKey: state.compareA },
        { heading: compactUnit(anchorByKey.get(state.compareB)?.label || "Anchor B"), anchorKey: state.compareB },
      ];
    }
    return [];
  }

  function collectTies(anchorKey, node) {
    const cached = payloadCache.get(anchorKey);
    if (!cached || typeof cached.then === "function") {
      loadPayload(anchorKey).then(() => {
        if (selectedGraphIndex >= 0 && activeGraph.nodes[selectedGraphIndex] === node) renderDrawer();
      }).catch((error) => {
        console.error(error);
        showToast("Unable to load tie detail");
      });
      return { loading: true, ties: [] };
    }
    const anchorSet = new Set(index.anchor_pids[anchorKey] || []);
    const ties = filteredEdges(cached, anchorSet)
      .filter((edge) => edge.rel === node.rel)
      .map((edge) => {
        const anchorPid = anchorSet.has(edge.a) ? edge.a : edge.b;
        const otherPid = anchorPid === edge.a ? edge.b : edge.a;
        return {
          anchorPid,
          otherPid,
          works: edge.works,
          payload: cached,
          pairKey: [anchorPid, otherPid].sort().join(":"),
        };
      })
      .filter((tie) => partnerNodeMatchesPid(tie.otherPid, node))
      .sort((a, b) => b.works - a.works);
    return { loading: false, ties };
  }

  function renderTieTable(ties) {
    if (!ties.length) {
      return '<p class="empty-copy">Detailed tie breakdown isn’t available for this partner at the current filters.</p>';
    }
    return `<div class="tie-table">
      <span class="tie-head">Scholar</span>
      <span class="tie-head">Collaborator</span>
      <span class="tie-head">Unit / institution</span>
      <span class="tie-head tie-works">Works</span>
      ${ties.map((tie) => {
        const anchorPerson = index.people[tie.anchorPid] || ["Unknown", 3, ""];
        const otherPerson = index.people[tie.otherPid] || ["Unknown", 3, ""];
        return `<div class="tie-row" data-focus-pid="${esc(tie.anchorPid)}">
          <span>${esc(anchorPerson[0])}</span>
          <span>${esc(otherPerson[0])}</span>
          <span>${esc(otherPerson[2] || "")}</span>
          <span class="tie-works">${number(tie.works)}</span>
        </div>`;
      }).join("")}
    </div>`;
  }

  function renderTieWorks(node, ties) {
    if (!worksMeta) {
      ensureWorksMeta().then(() => {
        if (selectedGraphIndex >= 0 && activeGraph.nodes[selectedGraphIndex] === node && state.drawerTab === "works") renderDrawer();
      }).catch((error) => {
        console.error(error);
        showToast("Unable to load work titles");
      });
      return '<p class="empty-copy">Loading collaborative works...</p>';
    }
    const rows = [];
    const seen = new Set();
    ties.forEach((tie) => {
      const workIds = tie.payload?.edge_wids?.[tie.pairKey] || [];
      workIds.forEach((workId) => {
        if (seen.has(workId) || !worksMeta[workId] || rows.length >= 150) return;
        seen.add(workId);
        const [title, year, typeIndex] = worksMeta[workId];
        const anchorPerson = index.people[tie.anchorPid] || ["Unknown", 3, ""];
        const otherPerson = index.people[tie.otherPid] || ["Unknown", 3, ""];
        rows.push({ title, year, type: TYPE_LABELS[typeIndex] || "Work", pair: `${anchorPerson[0]} & ${otherPerson[0]}` });
      });
    });
    if (!rows.length) return '<p class="empty-copy">No work titles are available for this selection.</p>';
    return `<div class="work-list">${rows.map((row) => (
      `<div class="work-row"><span><strong>${esc(row.title)}</strong><br><span class="muted">${esc(row.type)} · ${esc(row.pair)}${row.year ? ` · ${esc(row.year)}` : ""}</span></span></div>`
    )).join("")}</div>`;
  }

  function renderNodeTieSections(node, renderContent) {
    return tieGroupsForNode(node).map((group) => {
      const { loading, ties } = collectTies(group.anchorKey, node);
      const body = loading ? '<p class="empty-copy">Loading who’s behind this number…</p>' : renderContent(node, ties);
      const heading = group.heading ? `Who's behind this — ${esc(group.heading)}` : "Who's behind this";
      return `<section class="drawer-section"><h3>${heading}</h3>${body}</section>`;
    }).join("");
  }

  function renderAggregateDrawer(node) {
    setDrawerHeading(node.full || node.label || "Selected node", `${number(node.works || node.deg)} works`, true);
    const nodeIndex = activeGraph.nodes.indexOf(node);
    const partners = activeGraph.links
      .filter((link) => link.source === nodeIndex || link.target === nodeIndex)
      .map((link) => {
        const otherIndex = link.source === nodeIndex ? link.target : link.source;
        return { node: activeGraph.nodes[otherIndex], works: link.works };
      })
      .sort((a, b) => b.works - a.works);
    const metricsHtml = `<section class="drawer-section"><div class="metric-grid">
      <div class="metric"><strong>${number(node.works || node.deg)}</strong><span>Works</span></div>
      <div class="metric"><strong>${number(partners.length)}</strong><span>Partners</span></div>
      <div class="metric"><strong>${number(partners.reduce((sum, item) => sum + item.works, 0))}</strong><span>Cross-links</span></div>
    </div></section>`;

    if (["unit-partner", "compare-unique", "compare-shared"].includes(node.kind)) {
      if (state.drawerTab === "works") {
        return `${metricsHtml}${renderNodeTieSections(node, (n, ties) => renderTieWorks(n, ties))}`;
      }
      if (state.drawerTab === "people") {
        return `${metricsHtml}${renderNodeTieSections(node, (n, ties) => renderTieTable(ties))}
          <p class="filter-note">Click a scholar to open their full collaboration profile in Focus view. See the Works tab above for titles.</p>`;
      }
      return `${metricsHtml}<p class="filter-note">See the People tab above for who makes up this tie count, and Works for the underlying titles.</p>`;
    }
    if (node.kind === "bridge-unit") {
      return `${metricsHtml}<section class="drawer-section"><h3>Bridge scholars connecting here</h3>${renderBridgeUnitTies(node)}</section>`;
    }
    return `${metricsHtml}<section class="drawer-section"><h3>Top partners</h3><div class="rank-list">${partners.slice(0, 40).map((item) => `<div class="rank-row"><span>${esc(item.node.full || item.node.label)}</span><strong>${number(item.works)}</strong></div>`).join("")}</div></section>`;
  }

  function renderBridgeUnitTies(node) {
    const ranking = activeGraph.meta.ranking || [];
    const rows = ranking
      .filter((score) => score.units.has(node.id))
      .map((score) => ({ pid: score.pid, works: score.unitWorks.get(node.id) || 0 }))
      .sort((a, b) => b.works - a.works);
    if (!rows.length) return '<p class="empty-copy">No ranked bridge scholars connect to this unit.</p>';
    return `<ul class="people-list">${rows.map((row) => {
      const person = index.people[row.pid] || ["Unknown", 3, ""];
      return `<li><button class="person-row" type="button" data-focus-pid="${esc(row.pid)}">
        <span><strong>${esc(person[0])}</strong></span>
        <strong>${number(row.works)}</strong>
      </button></li>`;
    }).join("")}</ul>`;
  }

  function renderDrawer() {
    document.querySelectorAll(".drawer-tab").forEach((button) => {
      const active = button.dataset.tab === state.drawerTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    let html;
    const selectedNode = selectedGraphIndex >= 0 ? activeGraph.nodes[selectedGraphIndex] : null;
    if (state.selectedPid && currentFilteredEdges.length) {
      html = renderPersonDrawer(state.selectedPid);
    } else if (selectedNode && (state.view === "compare" || state.view === "bridges")) {
      // A specific node was clicked in a mode that otherwise shows a fixed summary —
      // prefer the node's own detail over the generic view-level drawer.
      html = renderAggregateDrawer(selectedNode);
    } else if (state.view === "compare") {
      html = renderCompareDrawer();
    } else if (state.view === "path") {
      html = renderPathDrawer();
    } else if (state.view === "bridges") {
      html = renderBridgeDrawer();
    } else if (selectedNode) {
      html = renderAggregateDrawer(selectedNode);
    } else {
      setDrawerHeading("Network summary", "AAD2024-2904");
      html = renderNetworkOverview();
    }
    $("drawerBody").innerHTML = html;
  }

  function nodeAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / zoom;
    const y = (clientY - rect.top - panY) / zoom;
    let best = -1;
    let bestDistance = Infinity;
    activeGraph.nodes.forEach((node, nodeIndex) => {
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance <= nodeRadius(node) + 6 && distance < bestDistance) {
        best = nodeIndex;
        bestDistance = distance;
      }
    });
    return best;
  }

  function showTooltip(nodeIndex, clientX, clientY) {
    if (nodeIndex < 0) {
      $("tooltip").hidden = true;
      return;
    }
    const node = activeGraph.nodes[nodeIndex];
    const ties = activeGraph.links.filter((link) => link.source === nodeIndex || link.target === nodeIndex);
    const total = ties.reduce((sum, link) => sum + Number(link.works || 0), 0);
    const rank = node.kind === "person" ? RANK_NAMES[node.rank] || "MIT scholar" : "Network node";
    $("tooltip").innerHTML = `<strong>${esc(node.full || node.label)}</strong><div>${esc(rank)}${node.extra ? ` · ${esc(node.extra)}` : ""}</div><div>${number(ties.length)} ties · ${number(total || node.works)} work-links</div>`;
    const wrap = $("graphWrap").getBoundingClientRect();
    const left = Math.max(8, Math.min(wrap.width - 320, clientX - wrap.left + 14));
    const top = Math.max(8, Math.min(wrap.height - 100, clientY - wrap.top - 10));
    $("tooltip").style.left = `${left}px`;
    $("tooltip").style.top = `${top}px`;
    $("tooltip").hidden = false;
  }

  function selectGraphNode(nodeIndex) {
    const node = activeGraph.nodes[nodeIndex];
    if (!node) return;
    if (node.kind === "person") {
      state.selectedPid = node.pid;
      state.view = "focus";
      state.drawerTab = "overview";
      syncControls();
      refresh();
      return;
    }
    const wasSelected = selectedGraphIndex === nodeIndex;
    selectedGraphIndex = wasSelected ? -1 : nodeIndex;
    if (!wasSelected) state.drawerTab = "overview";
    renderDrawer();
    draw();
  }

  function selectScholar(pid) {
    const anchor = preferredAnchorForPerson(pid);
    if (anchor) {
      state.unitKind = anchor.unit_kind;
      state.anchorKey = anchor.key;
      fillAnchorControls();
    }
    state.selectedPid = String(pid);
    state.view = "focus";
    state.drawerTab = "overview";
    $("scholarSearch").value = "";
    closeSearchResults();
    syncControls();
    refresh();
  }

  function renderSearchResults(query) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      closeSearchResults();
      return;
    }
    searchMatches = index.scholar_pids
      .filter((pid) => index.people[pid]?.[0]?.toLowerCase().includes(normalized))
      .sort((a, b) => index.people[a][0].localeCompare(index.people[b][0]))
      .slice(0, 10);
    searchActive = searchMatches.length ? 0 : -1;
    $("scholarResults").innerHTML = searchMatches.length
      ? searchMatches.map((pid, itemIndex) => `<button id="scholar-result-${itemIndex}" class="search-result${itemIndex === searchActive ? " active" : ""}" type="button" role="option" aria-selected="${itemIndex === searchActive}" data-search-pid="${esc(pid)}"><strong>${esc(index.people[pid][0])}</strong><span>${esc(index.people[pid][2] || RANK_NAMES[index.people[pid][1]] || "MIT scholar")}</span></button>`).join("")
      : '<div class="search-result"><strong>No matching scholars</strong></div>';
    $("scholarResults").hidden = false;
    $("scholarSearch").setAttribute("aria-expanded", "true");
    updateSearchActive();
  }

  function updateSearchActive() {
    $("scholarResults").querySelectorAll("[data-search-pid]").forEach((button, itemIndex) => {
      const active = itemIndex === searchActive;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    if (searchActive >= 0) $("scholarSearch").setAttribute("aria-activedescendant", `scholar-result-${searchActive}`);
    else $("scholarSearch").removeAttribute("aria-activedescendant");
  }

  function closeSearchResults() {
    searchMatches = [];
    searchActive = -1;
    $("scholarResults").hidden = true;
    $("scholarSearch").setAttribute("aria-expanded", "false");
    $("scholarSearch").removeAttribute("aria-activedescendant");
  }

  function bindCanvas() {
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointerDown = { x: event.clientX, y: event.clientY, panX, panY };
      const nodeIndex = nodeAt(event.clientX, event.clientY);
      if (nodeIndex >= 0) {
        draggingIndex = nodeIndex;
        activeGraph.nodes[nodeIndex].pinned = true;
      } else {
        panning = true;
        canvas.classList.add("dragging");
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (draggingIndex >= 0) {
        const rect = canvas.getBoundingClientRect();
        const node = activeGraph.nodes[draggingIndex];
        node.x = (event.clientX - rect.left - panX) / zoom;
        node.y = (event.clientY - rect.top - panY) / zoom;
        draw();
        return;
      }
      if (panning && pointerDown) {
        panX = pointerDown.panX + event.clientX - pointerDown.x;
        panY = pointerDown.panY + event.clientY - pointerDown.y;
        draw();
        return;
      }
      const nodeIndex = nodeAt(event.clientX, event.clientY);
      if (nodeIndex !== hoverGraphIndex) {
        hoverGraphIndex = nodeIndex;
        draw();
      }
      canvas.style.cursor = nodeIndex >= 0 ? "pointer" : "grab";
      showTooltip(nodeIndex, event.clientX, event.clientY);
    });

    canvas.addEventListener("pointerup", (event) => {
      const moved = pointerDown
        ? Math.abs(event.clientX - pointerDown.x) + Math.abs(event.clientY - pointerDown.y)
        : 99;
      const nodeIndex = nodeAt(event.clientX, event.clientY);
      panning = false;
      draggingIndex = -1;
      canvas.classList.remove("dragging");
      pointerDown = null;
      if (moved <= 6 && nodeIndex >= 0) selectGraphNode(nodeIndex);
    });

    canvas.addEventListener("pointercancel", () => {
      panning = false;
      draggingIndex = -1;
      pointerDown = null;
      canvas.classList.remove("dragging");
    });

    canvas.addEventListener("pointerleave", () => {
      if (!panning && draggingIndex < 0) {
        hoverGraphIndex = -1;
        $("tooltip").hidden = true;
        draw();
      }
    });

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldX = (mouseX - panX) / zoom;
      const worldY = (mouseY - panY) / zoom;
      const nextZoom = Math.max(0.15, Math.min(8, zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
      panX = mouseX - worldX * nextZoom;
      panY = mouseY - worldY * nextZoom;
      zoom = nextZoom;
      draw();
    }, { passive: false });
  }

  function bindControls() {
    document.querySelectorAll(".mode-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        if (state.view !== "focus") state.selectedPid = null;
        state.drawerTab = "overview";
        syncControls();
        refresh();
      });
    });

    $("levelControl").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.level = button.dataset.value;
      setSegment("levelControl", state.level);
      refresh();
    });

    $("unitKindControl").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.unitKind = button.dataset.value;
      fillAnchorControls();
      setSegment("unitKindControl", state.unitKind);
      refresh();
    });

    $("scopeControl").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.scope = button.dataset.value;
      setSegment("scopeControl", state.scope);
      refresh();
    });

    $("anchorSelect").addEventListener("change", () => {
      state.anchorKey = $("anchorSelect").value;
      state.selectedPid = null;
      state.pathStart = null;
      state.pathEnd = null;
      refresh();
    });

    $("topPartnersSelect").addEventListener("change", () => {
      const raw = $("topPartnersSelect").value;
      state.topPartners = raw === "all" ? "all" : clampInteger(raw, 1, 5000, 50);
      try { sessionStorage.setItem(TOPN_KEY, raw); } catch (e) { /* ignore */ }
      refresh();
    });

    $("compareA").addEventListener("change", () => {
      state.compareA = $("compareA").value;
      refresh();
    });
    $("compareB").addEventListener("change", () => {
      state.compareB = $("compareB").value;
      refresh();
    });
    const applyCompareLimit = () => {
      state.compareLimit = clampInteger($("compareLimit").value, 10, 2000, 100);
      $("compareLimit").value = String(state.compareLimit);
      refresh();
    };
    $("compareLimit").addEventListener("change", applyCompareLimit);
    $("compareLimit").addEventListener("keydown", (event) => {
      if (event.key === "Enter") applyCompareLimit();
    });
    $("compareShowAll").addEventListener("change", () => {
      state.compareShowAll = $("compareShowAll").checked;
      syncControls();
      refresh();
    });
    $("showHiddenBtn").addEventListener("click", () => {
      if (activeGraph.mode === "compare") {
        state.compareShowAll = true;
      } else {
        const meta = activeGraph.meta;
        if (meta.totalAnchors != null) state.topAnchors = clampInteger(meta.totalAnchors, 1, 1000, state.topAnchors);
        if (meta.totalPartners != null) state.partnerLimit = clampInteger(meta.totalPartners, 1, 2000, state.partnerLimit);
        // School/Department/Anchor's cap is "Show partners" (topPartners), not partnerLimit —
        // clear it too so "Show all" actually unhides everything in those views (per the
        // standing convention that this control must work everywhere nodes are capped).
        if (["unit", "school", "department", "person"].includes(activeGraph.mode)) {
          state.topPartners = "all";
          try { sessionStorage.setItem(TOPN_KEY, "all"); } catch (e) { /* ignore */ }
        }
      }
      syncControls();
      refresh();
    });

    $("pathStart").addEventListener("change", () => { state.pathStart = $("pathStart").value; syncUrl(); });
    $("pathEnd").addEventListener("change", () => { state.pathEnd = $("pathEnd").value; syncUrl(); });
    $("findPathBtn").addEventListener("click", refresh);

    const applyNumericFilters = () => {
      state.topAnchors = clampInteger($("topAnchors").value, 1, 1000, 50);
      state.partnerLimit = clampInteger($("partnerLimit").value, 1, 2000, 150);
      $("topAnchors").value = String(state.topAnchors);
      $("partnerLimit").value = String(state.partnerLimit);
      refresh();
    };
    $("topAnchors").addEventListener("change", applyNumericFilters);
    $("partnerLimit").addEventListener("change", applyNumericFilters);
    $("topAnchors").addEventListener("keydown", (event) => { if (event.key === "Enter") applyNumericFilters(); });
    $("partnerLimit").addEventListener("keydown", (event) => { if (event.key === "Enter") applyNumericFilters(); });

    $("rankBy").addEventListener("change", () => { state.rankBy = $("rankBy").value; refresh(); });
    $("authorCap").addEventListener("change", () => {
      state.cap = $("authorCap").value;
      syncControls();
      refresh();
    });
    $("typeFilters").addEventListener("change", () => {
      state.types = new Set([...document.querySelectorAll("#typeFilters input[data-type]")]
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.dataset.type));
      if (!state.types.size) state.types = new Set(TYPE_KEYS);
      syncControls();
      refresh();
    });

    $("filtersBtn").addEventListener("click", () => {
      const open = $("filtersPanel").hidden;
      $("filtersPanel").hidden = !open;
      $("filtersBtn").classList.toggle("active", open);
      $("filtersBtn").setAttribute("aria-expanded", String(open));
      setTimeout(() => {
        resizeCanvas();
        fitGraph();
      }, 0);
    });

    $("shareBtn").addEventListener("click", async () => {
      syncUrl();
      try {
        await navigator.clipboard.writeText(location.href);
        showToast("Network link copied");
      } catch {
        showToast("The current URL contains this network view");
      }
    });

    $("scholarSearch").addEventListener("input", (event) => renderSearchResults(event.target.value));
    $("scholarSearch").addEventListener("keydown", (event) => {
      if (!searchMatches.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        searchActive = (searchActive + 1) % searchMatches.length;
        updateSearchActive();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        searchActive = (searchActive - 1 + searchMatches.length) % searchMatches.length;
        updateSearchActive();
      } else if (event.key === "Enter" && searchActive >= 0) {
        event.preventDefault();
        selectScholar(searchMatches[searchActive]);
      } else if (event.key === "Escape") {
        closeSearchResults();
      }
    });
    $("scholarResults").addEventListener("click", (event) => {
      const button = event.target.closest("[data-search-pid]");
      if (button) selectScholar(button.dataset.searchPid);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#scholarSearchField")) closeSearchResults();
    });

    $("drawerTabs").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-tab]");
      if (!button) return;
      state.drawerTab = button.dataset.tab;
      renderDrawer();
    });
    $("drawerBody").addEventListener("click", (event) => {
      const button = event.target.closest("[data-focus-pid]");
      if (button) selectScholar(button.dataset.focusPid);
    });
    $("drawerClose").addEventListener("click", () => {
      state.selectedPid = null;
      selectedGraphIndex = -1;
      if (state.view === "focus") state.view = "explore";
      syncControls();
      refresh();
    });

    $("fitBtn").addEventListener("click", () => fitGraph());
    $("resetBtn").addEventListener("click", resetView);
    $("zoomInBtn").addEventListener("click", () => { zoom = Math.min(8, zoom * 1.2); draw(); });
    $("zoomOutBtn").addEventListener("click", () => { zoom = Math.max(0.15, zoom / 1.2); draw(); });

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeCanvas();
        refresh();
      }, 180);
    });
  }

  async function init() {
    bindControls();
    bindCanvas();
    resizeCanvas();
    showLoading();
    try {
      index = await fetchJson(INDEX_URL);
      anchorByKey = new Map(index.anchors.map((anchor) => [anchor.key, anchor]));
      buildMemberships();
      readUrlState();
      fillAnchorControls();
      syncControls();
      await refresh();
    } catch (error) {
      hideLoading();
      $("graphEmpty").textContent = error.message || "Unable to initialize the network.";
      $("graphEmpty").hidden = false;
      $("summaryStatus").textContent = "Network unavailable";
      console.error(error);
    }
  }

  init();
})();
