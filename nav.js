/**
 * collab-mit shared site nav — single source of truth for the top nav bar.
 * Every live page includes:
 *   <div id="aa-nav"></div>
 *   <script src="nav.js" defer></script>
 * in place of the old per-page inline `<div class="aa-nav">...</div>` + `.aa-nav` CSS rules.
 *
 * Behavior:
 * - `?embed=1` in the URL: do nothing (Phase 2 iframe-embed fallback / future embeds).
 * - Injects a <style> block (nav CSS, single source of truth) and the nav markup into
 *   #aa-nav (falls back to prepending to <body> if the placeholder is missing).
 * - Marks the current page by matching location.pathname's basename against each link's
 *   href; the matching item gets class "cur", and its parent category label gets the
 *   current (white + underline) treatment too.
 * - Dropdowns open on hover AND on click of the label/chevron (click just toggles; no
 *   keyboard/touch handling — not required).
 * - Also injects print CSS hiding the nav and the "Ask the data" chat widget
 *   (agent_widget.js's root elements: #aa-agent-btn, #aa-agent-panel).
 */
(function () {
  "use strict";

  if (/(^|[?&])embed=1(&|$)/.test(location.search)) return;

  // ---- Nav structure (see NAV_REDESIGN_SPEC.md section 1b) ----------------------------
  var NAV = [
    { label: "Home", href: "home.html" },
    {
      label: "AAD2024 Snapshot",
      href: "aad2024_overview.html",
      items: [
        { label: "Overview", href: "aad2024_overview.html", sep: true },
        { label: "Details", href: "details_v2.html" },
        { label: "Counts", href: "counts_v2.html" },
        { label: "Network", href: "network_viz.html" },
        { label: "Chord & Matrix", href: "chord_matrix.html" },
        { label: "Insights", href: "insights.html" },
        { label: "Trends", soon: true },
        { label: "Admin Overview", href: "admin_preview.html" },
        { label: "One-Pagers", href: "admin_preview.html#onepagers" }
      ]
    },
    {
      label: "Peer Comparisons",
      soonCategory: true,
      items: [
        { label: "Overview", soon: true },
        { label: "Counts", soon: true },
        { label: "Percentiles", soon: true },
        { label: "Trends", soon: true }
      ]
    },
    {
      label: "International & Industry",
      href: "intl_overview.html",
      items: [
        { label: "Overview", href: "intl_overview.html", sep: true },
        { label: "Details", href: "intl_details_table.html" },
        { label: "Map", href: "intl_map.html" },
        { label: "Trends", href: "intl_trends.html" },
        { label: "Counts", soon: true }
      ]
    },
    {
      label: "International Funding",
      soonCategory: true,
      items: [
        { label: "Overview", soon: true },
        { label: "Details", soon: true },
        { label: "Counts", soon: true },
        { label: "Funders", soon: true }
      ]
    },
    { label: "Key", href: "key.html", keyLink: true }
  ];

  // ---- CSS (single source of truth — remove per-page .aa-nav rules on rollout) --------
  var STYLE = ""
    + "#aa-nav{position:relative;z-index:200}"
    + ".aa-nav{background:#052448;padding:7px 20px;display:flex;align-items:center;gap:18px;"
    + "font:600 12px 'Open Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;flex-shrink:0}"
    + ".aa-nav .nav-item{position:relative;display:flex;align-items:center}"
    + ".aa-nav a.nav-link,.aa-nav a.nav-label,.aa-nav span.nav-label{color:rgba(255,255,255,.7);text-decoration:none;"
    + "font-weight:600;letter-spacing:.02em;padding:3px 2px;border-bottom:2px solid transparent;cursor:pointer;"
    + "display:inline-flex;align-items:center;gap:4px;background:none;border:0;border-bottom:2px solid transparent;"
    + "font:600 12px 'Open Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}"
    + ".aa-nav a.nav-link:hover,.aa-nav a.nav-label:hover{color:#fff}"
    + ".aa-nav a.nav-link.cur,.aa-nav a.nav-label.cur,.aa-nav span.nav-label.cur{color:#fff;border-bottom-color:#0066b4}"
    + ".aa-nav span.nav-label.soon-cat{cursor:default;opacity:.55}"
    + ".aa-nav .nav-chevron{color:rgba(255,255,255,.5);font-size:9px;margin-left:1px;cursor:pointer;padding:2px}"
    + ".aa-nav .nav-item:hover .nav-chevron{color:rgba(255,255,255,.85)}"
    + ".aa-nav .divider{display:block;width:2px;align-self:stretch;background:#fff;margin:0 6px;flex-shrink:0}"
    + ".aa-nav .dropdown-panel{position:absolute;top:100%;left:0;display:none;flex-direction:column;"
    + "background:#052448;border-radius:0 0 6px 6px;box-shadow:0 8px 20px rgba(0,0,0,.4);min-width:180px;"
    + "padding:4px 0;z-index:201}"
    + ".aa-nav .nav-item:hover .dropdown-panel,.aa-nav .nav-item.open .dropdown-panel{display:flex}"
    + ".aa-nav .dropdown-panel a,.aa-nav .dropdown-panel span.soon-item{display:flex;align-items:center;"
    + "justify-content:space-between;gap:8px;padding:7px 16px;color:rgba(255,255,255,.8);text-decoration:none;"
    + "font:600 12px 'Open Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;white-space:nowrap;"
    + "border-bottom:2px solid transparent}"
    + ".aa-nav .dropdown-panel a:hover{background:rgba(255,255,255,.08);color:#fff}"
    + ".aa-nav .dropdown-panel a.cur{color:#fff}"
    + ".aa-nav .dropdown-panel a.sep{border-bottom:1px solid rgba(255,255,255,.15);margin-bottom:2px;padding-bottom:9px}"
    + ".aa-nav .dropdown-panel span.soon-item{opacity:.5;cursor:default}"
    + ".aa-nav .soon-badge{font-size:9px;font-weight:700;background:rgba(255,255,255,.15);color:#fff;"
    + "padding:1px 5px;border-radius:3px;letter-spacing:.03em;flex-shrink:0}"
    + ".aa-nav .nav-spacer{margin-left:auto}"
    + ".aa-nav .key-link{margin-left:auto;color:rgba(255,255,255,.7);padding-left:16px;"
    + "border-left:1px solid rgba(255,255,255,.2)}"
    + ".aa-nav .key-link:hover{color:#fff}"
    + ".aa-nav .key-link.cur{color:#fff;border-bottom-color:#0066b4}"
    + "@media print{"
    + ".aa-nav{display:none !important}"
    + "#aa-agent-btn,#aa-agent-panel{display:none !important}"
    + "}";

  function basename(path) {
    var b = (path || "").split("/").pop();
    return b || "home.html";
  }

  function buildDropdownItem(item, curBase) {
    if (item.soon) {
      var span = document.createElement("span");
      span.className = "soon-item";
      var labelSpan = document.createElement("span");
      labelSpan.textContent = item.label;
      span.appendChild(labelSpan);
      var badge = document.createElement("span");
      badge.className = "soon-badge";
      badge.textContent = "soon";
      span.appendChild(badge);
      return span;
    }
    var a = document.createElement("a");
    a.href = item.href;
    if (item.sep) a.className = "sep";
    var isCur = basename(item.href) === curBase;
    if (isCur) a.className = (a.className ? a.className + " " : "") + "cur";
    var labelSpan2 = document.createElement("span");
    labelSpan2.textContent = item.label;
    a.appendChild(labelSpan2);
    return { el: a, cur: isCur };
  }

  function buildCategory(cat, curBase) {
    var wrap = document.createElement("div");
    wrap.className = "nav-item";

    var labelEl;
    var categoryIsCur = false;

    if (cat.soonCategory) {
      labelEl = document.createElement("span");
      labelEl.className = "nav-label soon-cat";
      var t = document.createElement("span");
      t.textContent = cat.label;
      labelEl.appendChild(t);
      var chev = document.createElement("span");
      chev.className = "nav-chevron";
      chev.textContent = "▾";
      labelEl.appendChild(chev);
    } else {
      labelEl = document.createElement("a");
      labelEl.className = "nav-label";
      labelEl.href = cat.href;
      var t2 = document.createElement("span");
      t2.textContent = cat.label;
      labelEl.appendChild(t2);
      var chev2 = document.createElement("span");
      chev2.className = "nav-chevron";
      chev2.textContent = "▾";
      chev2.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleOpen(wrap);
      });
      labelEl.appendChild(chev2);
      if (basename(cat.href) === curBase) categoryIsCur = true;
    }
    wrap.appendChild(labelEl);

    var panel = document.createElement("div");
    panel.className = "dropdown-panel";
    (cat.items || []).forEach(function (item) {
      var built = buildDropdownItem(item, curBase);
      if (built && built.el) {
        panel.appendChild(built.el);
        if (built.cur) categoryIsCur = true;
      } else if (built) {
        panel.appendChild(built);
      }
    });
    wrap.appendChild(panel);

    if (categoryIsCur) labelEl.classList.add("cur");

    return wrap;
  }

  function toggleOpen(navItemEl) {
    var wasOpen = navItemEl.classList.contains("open");
    document.querySelectorAll(".aa-nav .nav-item.open").forEach(function (el) {
      el.classList.remove("open");
    });
    if (!wasOpen) navItemEl.classList.add("open");
  }

  function build(container) {
    var curBase = basename(location.pathname);

    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    var bar = document.createElement("div");
    bar.className = "aa-nav";

    NAV.forEach(function (entry) {
      if (entry.divider) {
        var d = document.createElement("span");
        d.className = "divider";
        bar.appendChild(d);
        return;
      }
      if (entry.items) {
        bar.appendChild(buildCategory(entry, curBase));
        return;
      }
      var a = document.createElement("a");
      a.className = entry.keyLink ? "nav-link key-link" : "nav-link";
      a.href = entry.href;
      a.textContent = entry.label;
      if (basename(entry.href) === curBase) a.classList.add("cur");
      if (!entry.keyLink && entry === NAV[0]) {
        // Home: no extra treatment beyond .cur
      }
      bar.appendChild(a);
    });

    container.appendChild(bar);

    // Click toggles a dropdown open/closed (in addition to hover); click outside closes.
    bar.querySelectorAll(".nav-item").forEach(function (item) {
      var label = item.querySelector("a.nav-label, span.nav-label");
      if (label) {
        label.addEventListener("click", function (e) {
          // A real link (has href) still navigates; only the soon-category label,
          // which has no href, toggles the dropdown instead.
          if (label.tagName === "SPAN") {
            e.preventDefault();
            toggleOpen(item);
          }
        });
      }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".aa-nav .nav-item")) {
        document.querySelectorAll(".aa-nav .nav-item.open").forEach(function (el) {
          el.classList.remove("open");
        });
      }
    });
  }

  function init() {
    var container = document.getElementById("aa-nav");
    if (!container) {
      container = document.createElement("div");
      container.id = "aa-nav";
      document.body.insertBefore(container, document.body.firstChild);
    }
    build(container);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
