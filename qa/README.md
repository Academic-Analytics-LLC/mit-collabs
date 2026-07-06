# qa/ — test harnesses and validation evidence

Everything here was built and run on 2026-07-03/04. Keep it: a future session (any model)
can re-run these instead of rebuilding harnesses from scratch.

## Environment quirks a new session MUST know (hard-won)

1. **OneDrive sync race.** This folder is OneDrive-synced. Large writes can be silently
   truncated (it destroyed 5 of 7 pages before 2026-07-03) and a mid-sync file can be served
   to the user's browser (caused a "blank page" report). After ANY sizable write, verify the
   file still ends with `</html>` from BOTH the app-tool side (Grep) and the shell side (tail).
2. **App-tool edits are invisible to the shell.** Files edited with the app's Edit/Write tools
   never re-sync down to the shell mount within a session (the mount serves a version clipped
   at the file's OLD byte length — looks like truncation but isn't; the real file is fine).
   Shell-side writes DO reach the real folder reliably. Consequence: to TEST a file you edited
   with app tools, write a fresh-named copy and test that. `details_testcopy.html` here is the
   current test copy of details_table.html (JS-identical as of 2026-07-04).
3. **Shell calls are hard-capped ~45s and background processes die when the call ends.**
   Long jobs must be chunked with intermediate state (see harvest*.py, which pickle state to
   let a second call resume) and run with `timeout 43` inside a single call.
4. **jsdom recipe** (no browser exists in the sandbox — `npm install jsdom` into /tmp):
   stub `HTMLCanvasElement.prototype.getContext` with a no-op Proxy, `requestAnimationFrame`,
   `URL.createObjectURL` (capture the Blob to test CSV content), and
   `HTMLAnchorElement.prototype.click`; collect `window.addEventListener('error', ...)`.
   For details_table.html, mock `fetch` and trim `anchors.json` to
   `['U8927','U1902','U147078']` (Architecture dept + program + Koch) for fast loads.

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

## Validation verdicts (2026-07-04) — do not re-litigate without new data

- Matrix (723/723 unit + 27/27 college cells) and chord global (27/27): EXACT vs SAS.
- Chord anchored data ≡ counts data (tie-row ORDER differs — cosmetic).
- Counts partner rows follow the portal's same-unit-kind convention (Physics partner rows
  sum to the oracle 231). Do NOT "fix" this to all-affiliation attribution.
- Every residual small mismatch (counts within off-by-one on HST/IMES, 16 network anchors
  with ≤6 extra pairs, insights degree misses on Celi/Langer) traces to the work-universe
  variance: prototype dataset has a few works (HST/IMES conference abstracts) in zero SAS
  files; SAS has ~9 net extra (16,747 vs 16,738). OPEN: pick the authoritative universe.
- Counts (Simple) college/person tabs use the prototype's person-centric any-overlap
  classification; multi-affiliated people differ from anchor-relative recomputes BY DESIGN.
  OPEN: rebuild from SAS or document convention in key.html.
