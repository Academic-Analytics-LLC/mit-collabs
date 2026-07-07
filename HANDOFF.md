# collab-mit — Handoff (updated 2026-07-07, details_table Total Collaborators + shell-truncation quirk)

## 2026-07-07 — details_table.html: Works column → Total Collaborators; app/shell truncation quirk

**Change**: per user request, the "Works" column (a scholar's total personal work count — not
useful to them) is replaced with **"Total Collaborators"**: the true count of distinct people
(minus the row's own scholar) on that specific paper, computed once from the full unfiltered
roster (`computeWorkPersonCounts()`, keyed by work ID) so it doesn't shrink under Scope/type/
discipline filters. Applied to the on-screen column, sort tie-break, and CSV export. Verified via
jsdom against `C:\dev\collab-mit\details_table.html`: CSV row for Guth/Physics/Federal-Grant shows
`Total Collaborators=1`, header order correct, no JS errors.

**IMPORTANT environment finding**: after this edit, the shell-visible copy of
`details_table.html` was found genuinely truncated (991 lines / 54,467 bytes, cut off mid-statement
with no closing tags), while the Read tool showed the complete, correct 1013-line file. Byte-level
Python read confirmed the shell-side file really was short — not a false alarm. This is the same
symptom as the documented OneDrive "app-tool edits invisible to shell" quirk, but it happened on
`C:\dev\collab-mit`, which is a plain local-disk folder, **not** OneDrive-synced. So the quirk is
broader than previously scoped: **any file that has taken several sequential Edit-tool calls in a
session is at risk of the app-side and shell-side views diverging, on any folder, not just
OneDrive ones.** Fix applied: took the known-good content (verified via Read tool through the
final `</html>`), wrote it fresh via the Write tool to the outputs folder, then `cp`'d that file
over the shell-visible path (and the OneDrive `collab-mit` + `MITCollabs` copies) — i.e. did NOT
trust further Edit-tool calls on the same file to fix it. All three copies now verified
byte-identical (55,214 bytes), ending in `</html>`, zero `swork` references. **Takeaway for future
sessions**: after multiple Edit calls to the same file in one session, do a byte-level tail check
(not just Read-tool) before considering the file safe to deploy or serve; if it's short, rewrite
via Write+cp rather than another Edit.

## 2026-07-06 — Counts (Anchored) Person-view bug fix + 36-department audit

**Bug found by user** (comparing our Person-view table to a portal export): anchored on Physics,
Ashoori's row list was missing his 3 co-authored articles with Jarillo-Herrero — but the pair
*did* show up under Jarillo-Herrero's own rows. Root cause: `build_counts_table.py`'s
`pack_person_rows()` (MITCollabs folder) built the Person-view rows from `collab.network()`'s
deduplicated undirected edge list. For across/inter pairs this self-corrects (the anchor loop
visits every unit, so the pair gets generated from both sides independently). For **within-unit**
pairs (both people in the same anchor unit) the anchor loop only visits that unit once, so only
one direction (`sp=e["a"], cp=e["b"]`) was ever emitted — the other person's row list silently
never got that pair. Confirmed via the portal's own `within_unit.csv` exports that the portal
lists BOTH directions as separate rows for within-unit pairs (e.g. Ashoori→Jarillo-Herrero AND
Jarillo-Herrero→Ashoori, each 3 works) — so this was a real gap, not an intentional dedup.

**Fix**: when both edge endpoints are anchor-unit members, `pack_person_rows()` now emits both
directions. Rebuilt `counts_table.html` (chunked across multiple shell calls — the full rebuild
takes ~75s of actual compute against the 45s-per-call cap; see "chunked/checkpointed build"
note below) and pushed the new file to both `collab-mit` (OneDrive) and `dev--collab-mit`.
Verified: Physics oracle numbers still exact (within=948, across=231); Ashoori↔Jarillo-Herrero
now shows correctly in both directions.

**Full audit** (per user request, since they'd flagged this as something that should've been
caught earlier): wrote `/tmp/audit_counts2.py`, compared the rebuilt Person-view **within_unit**
rows against all 36 downloaded `portal_oracle/*/within_unit.csv` files (pair-for-pair, work-count
exact match, real placeholder rows with blank Collab Scholar filtered out). Result: **34/36
departments exact match, 0 new discrepancies**. The only 2 mismatches (EECS: Chandrakasan↔Palacios
off by 1 work; IMES: an extra Celi↔Langer pair) are the **same, already-documented** work-universe
variance from the 2026-07-04 QA run (16,738 vs 16,747 works, open item — see "Top open items"
below), not new bugs, and pre-date this fix.

Also checked `across_units.csv` per-pair against our data and found large apparent mismatches —
traced this to a **portal quirk, not our bug**: the portal's own `across_units.csv` download
includes same-unit pairs (e.g. Busza↔Harris, both Physics, appears in both `within_unit.csv` AND
`across_units.csv` with the same count) for scholars whose *works* also involve external
collaborators (mega-author consortium papers). This is a work-level "was this work across-scope"
tag bleeding into a pair-level row, not a simple partner/direction bug, and matches the existing
project note ("the portal's Inter vs Across-Institutions files are internally inconsistent") —
extending that caveat to `across_units.csv` too. Did not change anything based on this since the
already-validated **unit-level** across aggregate (231, from `collab.network()` rollup, a
different code path) is unaffected and still the documented oracle number.

**Other pages checked for the same bug class** (grepped all `build_*.py` in MITCollabs for the
`e["a"]==aid` / `anchor_pids` direction-assignment pattern that caused this): only
`build_counts_table.py` had it. `build_network_viz.py` / `build_chord_viz.py` use the same
`collab.network()` edges but render them as single undirected graph edges (correct — a graph
edge is inherently one line between two nodes, no "missing direction" possible). `collab.py`'s
`details()`/`details_works()` (feeding `details_table.html`) loop over **every** anchor-qualified
person independently and pair them against all work co-members, so within-unit pairs are already
symmetric by construction — confirmed by code reading, this data path never had the bug.
`matrix()` (feeds `matrix_viz.html`) stores cells by sorted-pair key, symmetric by construction.
Insights.html's per-scholar degree/betweenness come from counting edges touching a node, also
direction-agnostic. counts_simple.html uses a wholly different prototype pipeline with its own
already-documented convention difference (see "Top open items" #1 below) — not this bug, not
touched.

**Chunked/checkpointed build note for future long MITCollabs rebuilds**: the sandbox shell has a
hard 45s-per-call cap and does NOT preserve background processes across calls (confirmed: a
`nohup ... &` job is killed the instant the bash call returns, even with `disown`). To rebuild
`counts_table.html` (full run ≈75s of compute across ~87 anchors × 4 caps), used a checkpointed
runner (`/tmp/chunked_build.py`) that pickles progress to `/tmp/counts_state.pkl` and is re-invoked
across 3 calls, each processing anchors until ~33s elapsed then saving state; the final call
(empty queue) writes the HTML. `/tmp` persists across calls within a session; process trees do
not. Reuse this pattern for any future MITCollabs rebuild that can't fit in one call.

---

# collab-mit — Handoff (updated 2026-07-04, overnight deep-QA run)

## Overnight run (Jul 3–4) — read `QA_Overnight_2026-07-04.docx` for full detail

Changes: network legend is now level-aware (rank colors at Person/Anchor, school colors at
Department/College levels); Details page got the reviewed-report format (Faculty Name /
Collaboration Type / Collab ID / Collab Detail / Collab Title / Collab Institution / Collab
Faculty Name headers, "Select …" filter titles, faculty+collab discipline filters, Clear
Filters, Download Data (CSV)), unit-type SPLIT columns (Department / Program(s) / Medical,
each gated by Unit Type mode AND its own Show/Concat toggle), year multi-select (data years
only), and every authored mention of "Clinical" removed (Clinical Trial work type + two AA
discipline names remain — they are data values). `key.html` (nav slot 1 on all pages) is a
sidebar-TOC documentation page covering all 8 pages + AAD2024 time windows (+1 from 2023).

Validation status: matrix 723/723 unit cells + 27/27 college cells exact vs SAS; chord global
27/27; chord anchored ≡ counts data exactly (tie-order differs, cosmetic); counts within-works
72/74 anchors exact; network pair-exact on 58/74 anchors. EVERY residual mismatch traces to a
small work-universe variance between the prototype dataset and the SAS extract (concentrated
on HST/IMES, e.g. conference abstracts present in prototype data but in zero SAS files; SAS
has ~9 net extra works: 16,747 vs 16,738). Counts (Simple) college/person tabs use the
prototype's person-centric any-overlap classification — 1,088/1,270 person rows match an
anchor-relative recompute; multi-affiliated people (Langer etc.) differ BY CONVENTION, not by
bug. Insights degree spot-check 78/80 (2 misses = phantom-works people).

Top open items: (1) rebuild counts_simple college/person tabs + counts person view from SAS
or document the convention in the Key; (2) pick the authoritative work universe and rebuild
remaining prototype-fed embedded data; (3) get the project out of OneDrive (three sync-race
incidents confirmed — one truncated 4 files, one served a user-visible blank page);
(4) insights betweenness unverified; (5) human browser pass (no headless browser available).

Previous session's handoff below — pipeline architecture and schema notes still apply, but
details_table.html has since been heavily reworked (split unit columns, roster-based unique
works, discipline/year filters); trust the file itself over old descriptions.

---

# collab-mit — Handoff (2026-07-03, session 2: full-project sweep)

Read `CLAUDE.md` first. This file reflects the state after a full audit/repair sweep.
The previous handoff's content is superseded; its two data pipelines description is
repeated below because it's still the most important thing to understand.

## TL;DR state

All 7 pages exist, parse cleanly, render without errors in jsdom, and every page's numbers
now either match the SAS pipeline exactly or are documented below. Four pages that were
silently truncated have been repaired. The Details→Network cross-link is DONE. The
Unique-Works view was redesigned per user request.

## CRITICAL: the truncation mechanism was identified — OneDrive sync race

**Five of seven pages had been silently truncated** (details_table — rebuilt last session;
and discovered this session: network_viz, counts_table, chord_viz, matrix_viz — all cut
mid-statement in the same trailing `capN` handler code, no closing tags). Root cause is now
clear: this folder is OneDrive-synced, and large sequential writes get clipped by a
non-atomic sync race. Direct evidence this session: after an app-side edit to
details_table.html, the sandbox mount served a version clipped at the file's *old* byte
length, cut mid-statement — exactly the corruption signature found in the truncated files.
Consequences and rules:

- **After ANY large write to this folder, verify the tail** (`tail -c 100 file` must show
  `</html>`), ideally from both the app side and the shell side.
- The sandbox mount can serve a stale/clipped view of a file just edited on the host side.
  Don't "repair" a file that looks truncated until you've confirmed it's truncated on BOTH
  sides (host-side Grep for `</html>` is a cheap check).
- Recommend the user: move the project out of OneDrive, or pause OneDrive sync during work
  sessions, and get real git version control from a terminal outside the sandbox (git init
  inside the sandbox fails on OneDrive; a dead half-initialized `.git/` + `.gitignore` from
  a previous attempt is still in the folder and can be deleted manually).

## Two separate data pipelines (unchanged, still essential)

1. **SAS pipeline** (source of truth per CLAUDE.md): `sas/details_extract_AAD2024_MIT.sas`
   → `sas/details_base.csv` (1.6GB) → `sas/build_details_table.py` → `data/details/*.json`
   (per-anchor compact files; see schema below) → consumed at runtime by
   `details_table.html` (serve over http, e.g. `serve.bat`).
2. **MITCollabs prototype pipeline**: `../MITCollabs/collab.py` built the embedded data in
   counts_table, network_viz, chord_viz, matrix_viz, insights (copied wholesale + re-skinned).

## Validation scorecard (this session, all vs SAS `data/details/*.json`)

Ground truth recomputed from U8950.json (Physics): within=948, across=192 (true distinct),
all=2949 — matches oracle and prior session.

- `counts_table.html` — ✅ cards match oracle (948 within / 231 across partner-summed).
- `counts_simple.html` — ✅ (948 / 192 / MIT all=16,738), validated last session, renders clean.
- `network_viz.html` — ✅ **exact pair-level match**: Physics within edges 192/192 identical
  (works-sum 5,561), across edges 136/136 identical. The SAS raw rel-1 pairs (328) minus
  pairs that collapse to within under MIN(rel) (192) = network's 136 exactly. The two
  pipelines agree perfectly at person-pair grain.
- `chord_viz.html` anchored mode — ✅ same data as counts_table (Physics row 0/948/192).
- `chord_viz.html` GLOBAL mode — ❌ old school×school matrix did not match SAS under any
  definition → **REBUILT from SAS this session** (see below).
- `matrix_viz.html` — diagonal ✅ (Physics diag typed cells summed to exactly 948) but
  cross-unit cells ❌ (e.g. Physics×EAPS showed 289; SAS says 81 under distinct-person
  pairs; no definition reproduced 289 — an artifact of the old collab.py classification,
  likely contaminated by external collaborators' same-named home departments, e.g. every
  university has a "Physics, Department of" — cDept for rel-2 rows is the collaborator's
  dept at THEIR institution, NOT MIT) → **REBUILT from SAS this session**.
- `insights.html` — headline numbers ✅ (n_scholars=1270, n_works=16738). Per-scholar
  degree/betweenness derive from the person graph, which was validated exactly (network
  page) — acceptable. Not independently recomputed; lowest-priority residual.

## Rebuilt this session: matrix cells + chord global (now SAS-derived)

Definition used (consistent with the project's any-overlap philosophy): cell (A,B) =
count of DISTINCT WORKS having at least one distinct-person pair (scholar row in A's or
B's unit file, MIT-side collaborator, rel<2) connecting the two units/schools; diagonal =
within-unit works (rel 0). Broken out by the 7 work types (matrix) and by author-count caps
all/100/50/20 (author count per work = |sp ∪ cp| within a unit file — complete, because a
scholar's collaborator rows cover every co-author). Rebuild script logic lives in this
session's history; it reads `data/details/anchors.json` + unit files and patches the
`<script id="data" type="application/json">` blob in place. Department mode =
Department+Medical+Clinical unit files; Program mode = Program+Medical+Clinical.
Verified after patch: Physics diag [867,2,0,34,10,35,0] sums to 948 (identical type split
to the old data, confirming aligned definitions); Physics×EAPS now 81; chord Eng–Sci 1464,
Eng–Eng 2140. Both pages render clean in jsdom (34 dept labels / 7 colleges; 7 arcs, 20 ribbons).

**Important caveat for the user**: global chord + matrix cross-unit numbers CHANGED
(e.g. Physics×EAPS 289→81; chord Eng–Sci 1863→1464, Eng–Eng 1347→2140). Old values came
from the unvalidated prototype backend; new values are SAS-derived. Tell the user.

## Repairs this session (truncation fixes)

Reconstructed missing tails (all verified with node --check + jsdom render):
- `network_viz.html`: rest of capN handler + init (`resize(); fillAnchors(); buildGraph();`)
  + new URL-param block (below).
- `matrix_viz.html`: capN tail + `render();`
- `chord_viz.html`: capN tail + `fillAnchors(); render();`
- `counts_table.html`: capN tail + `fillDiscs();fillAnchors();render();`

## Details→Network cross-link (DONE)

- `network_viz.html` accepts `?pid=<personId>&anchor=<unit label | unit id | anchor key>`
  `&scope=<within_unit|across_units|intra|inter|all>`. Anchor resolution: exact key → label
  → `|U|<unit id>` suffix → auto-detect from pid via `D.anchor_pids` (Departments preferred).
  Sets uk/scope button states, selects the anchor, and `buildGraph()` consumes `_urlPid`
  (selects the node + opens its detail panel once; cleared after init so user rebuilds
  don't re-select). Tested: pid+label, pid-only, pid+unit-id, and no-params regression all
  pass with zero JS errors (previously every buildGraph() threw a swallowed ReferenceError
  from the undeclared `_urlPid` stub).
- `details_table.html`: every scholar/collaborator name is now a link (`netLink()`), passing
  pid + anchor (only when the row's dept is unambiguous — concat'd "a; b" depts omit anchor
  and let the network page auto-detect) + mapped scope. Styled `a.netlink` (dotted underline).

## Unique-Works view redesign (user request, DONE)

One row per work; columns: Title, Work Type, Year, Detail, # MIT, MIT Collaborators,
# External, External Collaborators. Every person appears exactly ONCE (scholars are no
longer duplicated on the collaborator side — the old view showed e.g. CAPPELLARO both as
scholar and collaborator). MIT list = scholars + rel<2 collaborators; External = rel 2.
Within/Across/Inter pills appear on MIT people ONLY when the Unit filter has a selection
(they're meaningless without a reference unit). CSV export updated to match. Verified in
jsdom against real U8927 data: 0 dup/overlap issues across 96 works, pills togglable,
links present. Toggle label renamed to "One row per work (MIT vs. external)".

## data/details/*.json schema (unchanged, for reference)

Unit file: `{strs:[...], people:{pid:[name,rank]}, works:{wid:[title,type,year,detail]},
rows_by_work:{wid:[[15-el row],...]}}`; row = `[pid,sCollegeIdx,sDeptIdx,sUnitTypeCode,
sDiscIdx,sBFIdx,cpid,cCollegeIdx,cDeptIdx,cUnitTypeCode,cDiscIdx,cBFIdx,cInstIdx,relCode,
dirCode]`; rel 0=within,1=across,2=across institutions. String indices are per-file.
NOTE: for rel-2 rows, cDept/cCollege are the collaborator's units at THEIR OWN institution
(name collisions with MIT units are common — always filter rel<2 for MIT-side aggregation).
`anchors.json`: 82 anchors with unit_type + file. Scholar-side sDept in a unit file is
always the anchor's own label (scholars' other affiliations appear via their rows in OTHER
unit files, not here).

## Still open

1. Visual QA in a real browser (jsdom only so far): details unique-works layout, matrix
   heat colors with the new value ranges (cap toggles shift ranges), chord ribbon
   proportions after global rebuild, cross-link click-through UX.
2. `insights.html` deep validation (betweenness/degree recompute) if it's promoted.
3. Real version control / move out of OneDrive (see sync-race section).
4. Old `.git` + `.gitignore` debris can be deleted manually by the user.
