const fs = require("fs");
const path = require("path");

function loadJsdom() {
  try {
    return require("jsdom");
  } catch {
    return require("C:/tmp/node_modules/jsdom");
  }
}

const { JSDOM } = loadJsdom();
const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "network_viz.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "network_viz.css"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "network_viz.js"), "utf8");
const detailsHtml = fs.readFileSync(path.join(ROOT, "details_v2.html"), "utf8");
const detailsScript = [...detailsHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
  .find((match) => !/\bsrc\s*=/i.test(match[1]) && match[2].includes("const DATA_DIR"))?.[2];

if (!detailsScript) throw new Error("Unable to find the Details page runtime script");

function canvasContext() {
  return new Proxy({}, {
    get(target, property) {
      if (property === "measureText") return (value) => ({ width: String(value).length * 7 });
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

function localFetch(window) {
  return async (input) => {
    const url = new URL(String(input), window.location.href);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(fs.readFileSync(file, "utf8")),
    };
  };
}

function detailsFetch(window) {
  return async (input) => {
    const url = new URL(String(input), window.location.href);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    let value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (relative === "data/details/anchors.json") {
      value = {
        anchors: value.anchors.filter((anchor) => (
          anchor.key === "U8926"
          || (anchor.kind === "college" && anchor.label === "Engineering, School of")
        )),
      };
    }
    return { ok: true, status: 200, json: async () => value };
  };
}

async function waitFor(check, label, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

async function createPage(url = "http://localhost:8766/network_viz.html") {
  const errors = [];
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const style = window.document.createElement("style");
  style.textContent = css;
  window.document.head.append(style);
  window.fetch = localFetch(window);
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.navigator.clipboard = { writeText: async () => {} };
  window.HTMLCanvasElement.prototype.getContext = canvasContext;
  window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.id === "networkCanvas" || this.id === "graphWrap") {
      return { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 650, width: 1200, height: 650 };
    }
    return { x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 40, width: 300, height: 40 };
  };
  window.addEventListener("error", (event) => errors.push(event.error || event.message));
  window.console.error = (...args) => errors.push(args.map(String).join(" "));
  window.eval(script);
  await waitFor(
    () => window.document.getElementById("loadingMask").hidden,
    "network initialization",
  );
  return { dom, window, document: window.document, errors };
}

async function createDetailsPage(anchor) {
  const query = new URLSearchParams({ pid: "25387", anchor, scope: "across_units" });
  const errors = [];
  const dom = new JSDOM(detailsHtml, {
    url: `http://localhost:8766/details_v2.html?${query}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.fetch = detailsFetch(window);
  window.URL.createObjectURL = () => "blob:qa";
  window.URL.revokeObjectURL = () => {};
  window.sessionStorage.setItem("aad2024_shared_filters", JSON.stringify({
    unitType: "Department",
    colleges: ["Science, School of"],
    units: ["Physics, Department of"],
    discipline: ["Physics"],
    years: ["2024"],
    titleQ: "stale session filter",
    facultyIds: ["not-the-requested-scholar"],
  }));
  window.addEventListener("error", (event) => errors.push(event.error || event.message));
  window.console.error = (...args) => errors.push(args.map(String).join(" "));
  window.eval(detailsScript);
  await waitFor(
    () => window.document.getElementById("statusText").textContent.includes("distinct works"),
    "Details deep-link initialization",
  );
  return { dom, window, document: window.document, errors };
}

async function main() {
  const page = await createPage();
  const { window, document, errors } = page;

  assert(document.getElementById("summaryStatus").textContent.includes("Aeronautics"), "default anchor renders");
  assert(document.getElementById("topAnchors").value === "50", "default anchor-scholar limit is 50");
  assert(document.getElementById("partnerLimit").value === "150", "default partner limit is 150");
  assert(Number(document.getElementById("summaryNodes").textContent.replace(/,/g, "")) <= 200, "default graph respects separate limits");
  assert(document.getElementById("scopeControl").querySelector('[data-value="all"]').classList.contains("active"), "required All scope remains the default");

  const search = document.getElementById("scholarSearch");
  search.value = "DE WECK";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  await waitFor(() => document.querySelectorAll("[data-search-pid]").length > 0, "scholar search results");
  document.querySelector("[data-search-pid]").click();
  await waitFor(() => document.getElementById("summaryStatus").textContent.includes("DE WECK"), "focused scholar view");
  assert(new URL(window.location.href).searchParams.get("view") === "focus", "focus view is stored in the URL");
  assert(document.getElementById("drawerHeading").textContent.includes("DE WECK"), "scholar fingerprint opens in the side drawer");
  assert(document.querySelector(".drawer-action").href.includes("details_v2.html?pid="), "drawer links to the selected scholar in Details");
  assert(document.querySelector(".drawer-action").href.includes("scope=all"), "Details link preserves collaboration scope");

  document.querySelector('[data-view="compare"]').click();
  await waitFor(() => document.getElementById("drawerHeading").textContent === "Anchor comparison", "compare view");
  assert(!document.getElementById("compareControls").hidden, "compare controls are visible");
  assert(window.getComputedStyle(document.getElementById("pathControls")).display === "none", "Compare hides Path controls");
  assert(window.getComputedStyle(document.getElementById("levelField")).display === "none", "Compare hides Explore-only controls");
  assert(Number(document.getElementById("summaryNodes").textContent.replace(/,/g, "")) > 1, "compare graph contains partner nodes");

  const compareA = document.getElementById("compareA");
  const compareB = document.getElementById("compareB");
  compareA.value = "Department|U|8928";
  compareA.dispatchEvent(new window.Event("change", { bubbles: true }));
  compareB.value = "Department|U|33841";
  compareB.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => document.getElementById("summaryBadge").textContent.includes("93 hidden from A"), "per-anchor Compare counts");
  assert(document.getElementById("summaryAnchorLabel").textContent === "Compared anchors", "Compare uses an accurate anchor label");
  assert(document.getElementById("summaryBadge").textContent.includes("27 hidden from B"), "Compare splits hidden counts by anchor");
  assert(document.getElementById("showHiddenBtn").textContent === "Show all 120", "Compare offers all hidden entries");

  document.getElementById("showHiddenBtn").click();
  await waitFor(() => document.getElementById("summaryBadge").textContent.includes("All 320"), "all Compare partners");
  assert(document.getElementById("summaryEdges").textContent === "320", "Show all renders every eligible Compare tie");
  assert(document.getElementById("compareLimit").disabled, "Show all disables the numeric cap");
  assert(new URL(window.location.href).searchParams.get("compareAll") === "1", "Show all is stored in the URL");

  const showAll = document.getElementById("compareShowAll");
  showAll.checked = false;
  showAll.dispatchEvent(new window.Event("change", { bubbles: true }));
  const compareLimit = document.getElementById("compareLimit");
  compareLimit.value = "75";
  compareLimit.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => document.getElementById("summaryBadge").textContent.includes("Top 75 per anchor"), "adjustable Compare limit");
  assert(new URL(window.location.href).searchParams.get("compareLimit") === "75", "Compare limit is stored in the URL");

  document.querySelector('[data-view="path"]').click();
  await waitFor(() => document.getElementById("pathStart").options.length > 1, "path scholar choices");
  document.getElementById("findPathBtn").click();
  await waitFor(() => document.getElementById("drawerHeading").textContent === "Collaboration path", "path view");
  assert(document.getElementById("pathControls").hidden === false, "path controls are visible");

  document.querySelector('[data-view="bridges"]').click();
  await waitFor(() => document.getElementById("drawerHeading").textContent === "Bridge scholars", "bridge view");
  assert(document.querySelectorAll("[data-focus-pid]").length > 0, "bridge ranking exposes keyboard-accessible scholars");

  assert(errors.length === 0, `runtime completed without errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  page.dom.window.close();

  const deepLink = await createPage("http://localhost:8766/network_viz.html?pid=25387&anchor=Department%7CU%7C8926&scope=all");
  await waitFor(() => deepLink.document.getElementById("drawerHeading").textContent.includes("DE WECK"), "deep-linked fingerprint");
  assert(deepLink.document.querySelector('[data-view="focus"]').classList.contains("active"), "legacy Details deep link restores Focus mode");
  assert(deepLink.errors.length === 0, "deep-linked runtime completed without errors");
  deepLink.dom.window.close();

  const detailsUnit = await createDetailsPage("Department|U|8926");
  assert(detailsUnit.document.getElementById("scope").value === "1", "Details applies Network scope");
  assert(
    [...detailsUnit.document.getElementById("deptSel").selectedOptions]
      .some((option) => option.value === "Aeronautics and Astronautics, Department of"),
    "Details resolves a Network unit anchor",
  );
  assert(
    [...detailsUnit.document.getElementById("facultySel").selectedOptions]
      .some((option) => option.value === "25387"),
    "Details selects the Network scholar",
  );
  assert(detailsUnit.document.getElementById("titleFilter").value === "", "Details clears stale session filters");
  assert(detailsUnit.errors.length === 0, "unit-level Details handoff completed without errors");
  detailsUnit.dom.window.close();

  const detailsSchool = await createDetailsPage("Department|C|Engineering, School of");
  assert(
    [...detailsSchool.document.getElementById("collegeSel").selectedOptions]
      .some((option) => option.value === "Engineering, School of"),
    "Details resolves a Network school anchor",
  );
  assert(detailsSchool.errors.length === 0, "school-level Details handoff completed without errors");
  detailsSchool.dom.window.close();
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
