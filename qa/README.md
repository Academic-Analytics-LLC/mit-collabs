# qa/ — test harnesses and validation evidence

Everything here was built and run on 2026-07-03/04. Keep it: a future session (any model)
can re-run these instead of rebuilding harnesses from scratch.

## Environment quirks a new session MUST know (hard-won)

1. **App-tool/shell divergence.** Originally diagnosed as an OneDrive sync race (this project
   started OneDrive-synced, and that race really did destroy 5 of 7 pages and once served a
   mid-sync blank page to the user's browser — hence the move to the plain-disk
   `C:\dev\collab-mit` folder it now lives in permanently). But the same failure has recurred
   many times since, on this same non-OneDrive folder: after a file has had several Edit-tool
   calls in one session, the shell's view of it can show a stale, mid-statement-truncated
   snapshot while the app-side `Read` tool shows the true, complete, correctly-closed file. So
   treat this as a general app-tool/shell consistency quirk, not an OneDrive-only issue.
   Consequences: (a) after any sizable write, verify the file ends with `</html>` — but trust
   the `Read` tool's view over shell `cat`/`tail`/`wc`/`node --check` if they disagree; (b) to
   prove a file is genuinely broken (not just a stale shell view) and to test it, write a
   fresh-named copy and run the test against that (`details_testcopy.html` here is one such
   copy, JS-identical to `details_table.html` as of 2026-07-04); (c) if an in-place Edit to a
   large file seems to keep producing a stale/short shell view, stop editing in place —
   reconstruct the correct content from `Read`, write it to a brand-new filename, verify it,
   then overwrite the target through the shell.
2. **Shell calls are hard-capped ~45s and background processes die when the call ends.**
   Long jobs must be chunked with intermediate state (see harvest*.py, which pickle state to
   let a second call resume) and run with `timeout 43` inside a single call.
3. **jsdom recipe** (no browser exists in the sandbox — `npm install jsdom` into /tmp):
   stub `HTMLCanvasElement.prototype.getContext` with a no-op Proxy, `requestAnimationFrame`,
   `URL.createObjectURL` (capture the Blob to test CSV content), and
   `HTMLAnchorElement.prototype.click`; collect `window.addEventListener('error', ...)`.
   For details_v2.html, mock `fetch` and trim `anchors.json` to
   `['U8927','U1902','U147078']` (Architecture dept + program + Koch) for fast loads. Very
   large pages (e.g. the 30MB `network_viz.html`) can time out a full jsdom render at the 45s
   cap on jsdom's HTML tokenizer alone — not a real bug; fall back to extracting and testing
   the page's logic functions directly in plain Node instead of a full DOM render.

## Files

- `sA.js` / `sB.js` / `sC.js` — functional suite (37 tests, all passing as of 2026-07-04).
  sA: counts/matrix/insights render + oracle values. sB: chord, network deep-link/legend/scope,
  key page TOC. sC: details headers, CSV content vs on-screen totals, year multi-select,
  Clear Filters, no-clinical. Run: `node --max-old-space-size=4096 sA.js` (each fits in one call).
  Results snapshots: `suiteA/B/C.json`.
- `harvest.py 0 30` → `30 55` → `55 75` (3 calls) builds `/tmp/qa2/state.pkl` from ALL unit
  files; `harvest2.py 0 20` → `20 36` builds `/tmp/qa2/state2.pkl` (Department-mode only,
  per-person + college pairs). Then `checks.py` + `checks2.py` compare every page's embedded
  data against the recompute. `validate2.py` is the per-anchor counts/network comparison.
  Result logs: `validation_results*.txt`.
- `qadoc2.js` — builds the overnight QA docx (needs `npm install docx` in /tmp).

## 2026-07-10 addition: counts_v2.html (then counts_simple.html) SAS migration

New files in `sas/`: `build_counts_simple_v2.py` (flat validation rollup, Python stand-in
since no SAS engine exists in this sandbox), `build