/**
 * collab-mit "Ask" widget - floating chat button + panel, self-injecting.
 * Add `<script src="agent_widget.js" defer></script>` before </body> on any page to enable it.
 * Talks to a Cloudflare Worker proxy (see /worker) that holds the Anthropic API key server-side;
 * this file never sees or stores a key. Answers are grounded in data/agent/summary.json only.
 *
 * Until AGENT_ENDPOINT below is set to a real deployed Worker URL, the widget runs in a
 * client-side-only DEMO MODE: it does simple keyword matching against data/agent/summary.json
 * directly in the browser (no AI, no key, no network call out) just so you can see the UI and
 * basic wiring working locally before deploying the real Worker. See AGENT_SETUP.md.
 */
(function () {
  "use strict";

  // ===== Config -- replace with your deployed Worker URL (see the runbook) =====
  var AGENT_ENDPOINT = "https://mit-collabs-agent.nilshah-mitcollabs.workers.dev";
  var DEMO_MODE = !AGENT_ENDPOINT || AGENT_ENDPOINT.indexOf("YOUR-SUBDOMAIN") !== -1;

  var STYLE = ""
    + "#aa-agent-btn{position:fixed;right:20px;bottom:20px;z-index:9999;width:52px;height:52px;"
    + "border-radius:50%;background:#254467;color:#fff;border:none;cursor:pointer;"
    + "box-shadow:0 2px 10px rgba(5,36,72,.35);font:20px/1 'Open Sans',sans-serif;"
    + "display:flex;align-items:center;justify-content:center}"
    + "#aa-agent-btn:hover{background:#0066b4}"
    + "#aa-agent-btn .dot{position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;"
    + "background:#c98a00;border:2px solid #fff}"
    + "#aa-agent-panel{position:fixed;right:20px;bottom:82px;z-index:9999;width:340px;max-width:calc(100vw - 40px);"
    + "height:440px;max-height:calc(100vh - 120px);background:#fff;border-radius:10px;"
    + "box-shadow:0 6px 24px rgba(5,36,72,.3);display:none;flex-direction:column;overflow:hidden;"
    + "font:13px/1.4 'Open Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}"
    + "#aa-agent-panel.open{display:flex}"
    + "#aa-agent-head{background:#254467;color:#fff;padding:10px 14px;font-weight:700;font-size:13px;"
    + "display:flex;justify-content:space-between;align-items:center;flex-shrink:0}"
    + "#aa-agent-head span.sub{display:block;font-weight:400;font-size:10.5px;color:rgba(255,255,255,.7);margin-top:1px}"
    + "#aa-agent-head span.demo{display:inline-block;margin-left:6px;font-size:9px;font-weight:700;"
    + "background:#c98a00;color:#fff;padding:1px 6px;border-radius:8px;vertical-align:1px}"
    + "#aa-agent-close{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;padding:2px 6px}"
    + "#aa-agent-msgs{flex:1;overflow-y:auto;padding:10px 12px;background:#f7f7f7;display:flex;flex-direction:column;gap:8px}"
    + ".aa-msg{max-width:88%;padding:7px 10px;border-radius:8px;white-space:pre-wrap;word-wrap:break-word}"
    + ".aa-msg.user{align-self:flex-end;background:#0066b4;color:#fff;border-bottom-right-radius:2px}"
    + ".aa-msg.bot{align-self:flex-start;background:#eef1f5;color:#212529;border-bottom-left-radius:2px}"
    + ".aa-msg.err{align-self:flex-start;background:#fbe4e4;color:#8a2b2b}"
    + ".aa-msg.hint{align-self:center;background:transparent;color:#5a6a80;font-size:11.5px;text-align:center;max-width:100%}"
    + "#aa-agent-form{display:flex;gap:6px;padding:8px;border-top:1px solid #e2e5ea;flex-shrink:0;background:#fff}"
    + "#aa-agent-input{flex:1;font:13px inherit;padding:7px 9px;border:1px solid #e2e5ea;border-radius:6px;min-width:0}"
    + "#aa-agent-send{font:13px inherit;font-weight:700;padding:7px 12px;border-radius:6px;border:none;"
    + "background:#254467;color:#fff;cursor:pointer;flex-shrink:0}"
    + "#aa-agent-send:disabled{opacity:.5;cursor:default}";

  function injectStyle() {
    var s = document.createElement("style");
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function addMsg(container, text, cls) {
    var d = document.createElement("div");
    d.className = "aa-msg " + cls;
    d.textContent = text;
    container.appendChild(d);
    container.scrollTop = container.scrollHeight;
    return d;
  }

  var summaryCache = null;
  function loadSummary() {
    if (summaryCache) return Promise.resolve(summaryCache);
    return fetch("data/agent/summary.json").then(function (r) {
      if (!r.ok) throw new Error("demo mode: could not load summary.json (" + r.status + ")");
      return r.json();
    }).then(function (json) {
      summaryCache = json;
      return json;
    });
  }

  // Rough demo-mode-only acronym hints -- real matching happens via the label check below.
  var ALIASES = { eecs: "electrical engineering and computer", csail: "electrical engineering and computer",
    aero: "aeronautics", biology: "biology", chem: "chemistry",
    physics: "physics, department", math: "mathematics", mit: "massachusetts institute" };

  function findUnit(q, data) {
    var pools = [].concat(
      data.levels.department.Department || [],
      data.levels.department.Program || [],
      data.levels.college.Department || [],
      data.levels.college.Program || []
    );
    for (var alias in ALIASES) {
      if (q.indexOf(alias) !== -1) { q = q + " " + ALIASES[alias]; break; }
    }
    var best = null, bestLen = 0;
    for (var i = 0; i < pools.length; i++) {
      var r = pools[i];
      var key = r.label.split(",")[0].trim().toLowerCase();
      if (key.length > 2 && q.indexOf(key) !== -1 && key.length > bestLen) {
        best = r; bestLen = key.length;
      }
    }
    return best;
  }

  function demoAnswer(question, data) {
    var q = question.toLowerCase();
    var scopes = ["within", "across", "intra", "inter", "all"];
    var scope = "all";
    for (var i = 0; i < scopes.length; i++) { if (q.indexOf(scopes[i]) !== -1) { scope = scopes[i]; break; } }
    var metric = q.indexOf("collab") !== -1 ? "collabs" : "works";
    var wantPartners = q.indexOf("partner") !== -1;

    if (/^\s*(hi|hello|hey)\b/.test(q)) {
      return "DEMO MODE: Hi. Try Physics within works or EECS top partners.";
    }
    var unit = findUnit(q, data);
    if (!unit) {
      return "DEMO MODE: no unit name recognized. Try Physics, EECS, Biology plus within across inter intra all.";
    }
    if (wantPartners) {
      var parts = (unit.top_partners || []).slice(0, 3).map(function (p) {
        return p.label + " (" + p.works + ")";
      });
      return "DEMO MODE: " + unit.label + " top partners: " + (parts.join("; ") || "none") + ".";
    }
    var bucket = unit[metric] || {};
    var val = bucket[scope];
    var valStr = (val != null) ? String(val) : "n/a";
    return "DEMO MODE: " + unit.label + " " + scope + " " + metric + " = " + valStr + ".";
  }

  function askReal(question) {
    return fetch(AGENT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: question }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ("request failed (" + r.status + ")"));
        return data.answer || "(no answer)";
      });
    });
  }

  function ask(question) {
    if (DEMO_MODE) {
      return loadSummary().then(function (data) { return demoAnswer(question, data); });
    }
    return askReal(question);
  }

  function build() {
    injectStyle();

    var btn = document.createElement("button");
    btn.id = "aa-agent-btn";
    btn.type = "button";
    btn.title = "Ask a question about the MIT collaboration data";
    btn.textContent = "?";
    if (DEMO_MODE) {
      var dot = document.createElement("span");
      dot.className = "dot";
      btn.appendChild(dot);
    }

    var panel = document.createElement("div");
    panel.id = "aa-agent-panel";
    panel.innerHTML =
      '<div id="aa-agent-head"><div>Ask the data' + (DEMO_MODE ? '<span class="demo">DEMO</span>' : "") +
      '<span class="sub">MIT Collaboration Network</span></div>' +
      '<button type="button" id="aa-agent-close" aria-label="Close">&times;</button></div>' +
      '<div id="aa-agent-msgs"></div>' +
      '<form id="aa-agent-form">' +
      '<input type="text" id="aa-agent-input" placeholder="Ask a question" autocomplete="off">' +
      '<button type="submit" id="aa-agent-send">Ask</button>' +
      '</form>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    var msgs = panel.querySelector("#aa-agent-msgs");
    var form = panel.querySelector("#aa-agent-form");
    var input = panel.querySelector("#aa-agent-input");
    var send = panel.querySelector("#aa-agent-send");
    var greeted = false;

    btn.onclick = function () {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) {
        if (!greeted) {
          addMsg(msgs, DEMO_MODE ? "Offline demo mode. Try Physics within works." : "Ask about collaboration counts.", "hint");
          greeted = true;
        }
        input.focus();
      }
    };
    panel.querySelector("#aa-agent-close").onclick = function () { panel.classList.remove("open"); };

    form.onsubmit = function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      addMsg(msgs, q, "user");
      input.value = "";
      input.disabled = true; send.disabled = true;
      var pending = addMsg(msgs, "Thinking...", "bot");
      ask(q).then(function (answer) {
        pending.textContent = answer;
      }).catch(function (err) {
        pending.remove();
        addMsg(msgs, String(err && err.message || err), "err");
      }).then(function () {
        input.disabled = false; send.disabled = false; input.focus();
      });
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
