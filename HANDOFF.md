# collab-mit — Handoff (updated 2026-07-11: Counts page header/filter-pane layout matched to
Details; see dated entry directly below "START HERE" for detail)

## 2026-07-11 — Counts page (`counts_v2.html`): filter pane matched to Details' layout, methodology note moved below the header
User didn't like the long "Works vs. Collaborations / Within-Across-Inter-Intra-All" methodology
paragraph sitting inside the dark-navy `<header>` above the filters, and wanted the header/filter
pane to match Details' size and layout exactly. Details' header is just `<h1>` + `.controls` with
nothing else — no sub-note. Removed the `.sub` paragraph from inside `<header>` (was between
`<h1>` and `.controls`, forcing `<header>` taller than Details'); `<header>` is now byte-for-byte
the same shape as Details' (h1 immediately followed by `.controls`). The same explanatory text now
renders in a new `.methodology` div directly below `</header>` (light card background, `var(--ink)`
bold terms, `var(--line)` bottom border) so it's still fully present, just relocated per request.
No JS depends on `.sub`/`.methodology` (pure display text, no ids) so no script changes needed.

**Verification:** confirmed via the Read tool (authoritative per `qa/README.md`) that the live file
ends correctly in `</html>` and the edited region reads exactly as intended (h1 -> controls -> new
methodology div -> table wrap). Hit the documented "app-tool edits invisible to shell" quirk again
while checking: immediately after the edit, the shell's `tail`/`wc` view of `counts_v2.html` showed
the file cut off mid-statement inside the `capHint` line near the very end - a stale snapshot, not
a real truncation - while the Read tool showed the complete, correctly-closed file throughout. Per
this project's own precedent (this quirk isn't OneDrive-specific; it recurred on this same
C:\dev\collab-mit file today with no OneDrive mount connected), trusted the Read tool and did not
re-write the file through the shell.

## START HERE (next session) — 2026-07-10 end-of-day status
Everything below this line is fully done and verified unless marked otherwise. Read this block
first, then `DECISIONS.md`, then `qa/README.md` (environment quirks), per this file's own
instructions in `CLAUDE.md`.

**Done and verified this session:**
- Counts page (`counts_v2.html`): full mutual cascade (College/Unit/Discipline/Person), new
  Select Person(s) filter, Title/Detail boxes removed, Intra-before-Inter column order, the real
  College<->Unit multi-affiliation bug found and fixed (see dated section below).
- Details page (`details_v2.html`): **just finished** - extended from one-directional
  College->Unit narrowing to the SAME full mutual cascade as Counts (College<->Unit<->
  Discipline<->Faculty, every filter narrows every other). Recovered from an in-session file
  truncation (see quirk note below) and re-verified with a real-data jsdom test: selecting
  College="Architecture and Planning, School of" correctly narrows Units to exactly the 3 real
  units; further selecting a Unit narrows Discipline/Faculty further; clearing both and instead
  selecting Faculty="ABADIE, ALBERTO" (a real 2-department scholar) correctly narrows College to
  his 2 real colleges and Unit to his 2 real units. No errors, all counts matched expectations.
- `network_viz.html` restored from backup after being found genuinely (pre-existing) truncated.

**NOT done - pick up here next:**
1. **Nav bar visual separation for Int'l pages** (user request, end of this session, not yet
   started): in `.aa-nav`, add a thick white vertical divider between the Insights link and the
   Int'l Collabs link, add spacing so Int'l Collabs/Int'l Map sit visually apart (they're a
   different dataset - see `DECISIONS.md`), and spell out "Int'l" as "International" in both
   link labels. Needs to land on ALL pages sharing `.aa-nav` (currently 9: key, details_v2,
   counts_v2, network_viz, chord_viz, matrix_viz, insights, intl_details_table, intl_map).
2. Rebuild `network_viz.html`'s `?pid=&anchor=&scope=` deep-link handling - likely lost when
   restoring from the pre-features backup; code comments referencing `_urlPid`/`_urlAnchorKey`
   are still there as a guide.
3. Decide whether to delete the now-superseded originals `counts_simple.html` /
   `details_table.html` (their `_v2` replacements are fully verified) - needs
   `allow_cowork_file_delete` since files in this folder can't be removed without it.
4. (Older, unrelated) Sync the SAS export script schema and reshape the real SAS export once the
   user runs it - see "Counting conventions" in `DECISIONS.md`.

**Environment quirk reconfirmed today, worth remembering:** the app-side file tools (Read/Edit/
Write) and the shell's view of the SAME file can genuinely diverge mid-session - an in-place
`Edit` to `details_v2.html`-in-progress left the shell seeing a stale, mid-statement-truncated
snapshot (cut off inside `downloadCsv()`) while the Read tool showed the complete, correct file
the whole time (confirmed via exact line-count match against what the edits should have produced).
Recovery pattern that worked cleanly: reconstruct the full correct content from what the Read tool
returns (not the shell), `Write` it to a **brand-new filename** (fresh Writes reliably sync to the
shell; in-place Edits to an existing large file sometimes don't, that session), verify the fresh
file byte-for-byte + `node --check`, THEN `cat` it over the target file in the shell.

## 2026-07-10 (even newer) — Counts/Details renamed to counts_v2.html/details_v2.html; real bug found + fixed in College<->Unit cascade; network_viz.html restored from backup

User asked to rename counts_simple.html/details_table.html to fresh filenames (to rule out
browser caching after several confusing "looks reverted to the old version" reports) and delete
the originals. Renamed to `counts_v2.html`/`details_v2.html`; every live page's nav updated to
the new names. Along the way, found and fixed real problems, unrelated to caching:

- Six pages (chord_viz, insights, intl_details_table, intl_map, key, matrix_viz) picked up
  harmless trailing null-byte padding after their nav hrefs were edited in place - a filesystem
  quirk of this mount when an edit shortens a file (confirmed content before the padding was
  always fully intact; trimmed it in every case).
- `network_viz.html` (30MB) was found genuinely truncated mid-statement - confirmed via both the
  shell and the app-side file view, and confirmed NOT caused by this session's edit (an
  untouched, several-days-old backup showed the identical failure pattern). No OneDrive version
  history was available. Restored from `network_viz_backup_2026-07-09_pre-features.html` (the
  cleanest, closest-sized backup on disk) and re-pointed its nav to the new filenames. Verified:
  data blob parses, JS has no syntax errors, executes past setup (canvas/rAf calls only fail in
  the headless test harness, which lacks those browser APIs - expected). Likely still missing
  one small feature - the `?pid=&anchor=&scope=` deep-link handling that lets Details page links
  jump straight to a person - since that's exactly where the old broken file cut off; not yet
  rebuilt.
- **Real bug, not a caching issue**: user reported "Units not responding to the school filter"
  even on the freshly-renamed, confirmed-correct `counts_v2.html`. Root cause: `attrPool()`
  derives ALL four cascading filters (College/Unit/Discipline/Person) from per-PERSON rows,
  each of which carries `college` and `units` as two INDEPENDENTLY pipe-joined lists with no
  pairing between them. A person affiliated with several units across several colleges (e.g.
  Edward Boyden: colleges "Architecture and Planning | Engineering | Science", units spanning
  Biological Engineering / Brain and Cognitive Sciences / Media Arts and Sciences / the Koch
  Institute) matched into the pool as soon as ANY of his colleges matched, then contributed ALL
  of his units regardless of which college they actually belonged to - leaking units from other
  colleges into the narrowed list. Verified directly against the real data (36 units, 1,270
  people) that this reproduces exactly with real names, not just theoretically.
  Fixed by giving College<->Unit its own dedicated, unambiguous 1:1 map built from the
  DEPARTMENT-level rows instead (`collegeUnitMaps()`/`_unitToCollege`/`_collegeToUnits` - every
  unit has exactly one college there, no per-person ambiguity), mirroring how
  details_table.html's own `collegeToDepts` already avoids this exact trap. `fillUnits()` and
  `fillColleges()` now use that map for their primary relationship, and additionally narrow
  through the person-level pool only when Discipline/Person filters are active (the best
  available signal for that pair, though it carries the same theoretical caveat - not yet
  reported as a problem in practice). Re-verified after the fix: selecting "Architecture and
  Planning, School of" now correctly narrows Units to exactly the 3 real units
  (Architecture/Media Arts and Sciences/Urban Studies and Planning), and selecting a unit
  correctly narrows College back down to just its one real college.
- Also removed the Title contains / Detail contains boxes from the Counts page per user request
  (UI + all associated JS state/handlers/shared-storage fields removed cleanly, verified nothing
  references the removed element ids anymore).
- Encountered the same "large edit truncates this specific file mid-write" failure mode twice
  more this session (once on `details_v2.html`, once on `counts_v2.html` after the College<->Unit
  fix) - both times recovered using the same reliable recipe: pull the true, complete content via
  the Read tool (authoritative), write it to a fresh scratch file, `node --check` it, then splice
  it onto the known-good head (the embedded data blob, unaffected) and overwrite the live file
  directly through the shell. Both re-verified end-to-end (data parses, JS syntax-checks, loads
  and renders correctly in a headless DOM test) after recovery.

Not yet deleted: `counts_simple.html`, `details_table.html` (waiting on confirmation, now that
their replacements are verified working). Not yet rebuilt: the network deep-link feature.

## 2026-07-10 (newest) — Counts page: full mutual cascade across College/Unit/Discipline/Person + new Select Person(s) filter

Started from two reports and ended up further than either: (1) "Units not responding to the
school filter, things should cascade" (College should narrow Unit, like details_table.html's
`collegeSel` -> `refreshCollegeDeptOptions()` -> `deptSel`). (2) "There's no person filter like
the previous page" - details_table.html has a dedicated Select Faculty control (type-ahead +
multi-select of individual scholars); Counts only had the generic free-text Search box. Then,
once a one-directional College->Unit cascade and a new Select Person(s) filter were in place,
two more reports arrived in quick succession: "the discipline filters don't respond to the
previous selected filters" and "basically every filter should respond to every other filter" -
i.e. NOT the one-directional pattern details_table.html uses for its single College/Unit pair,
but full mutual narrowing across all four entity-attribute filters.

Final design: a single `attrPool(exclude)` helper (built on `D.person[uk]`, which already
carries `college`/`units`/`disc` per person) computes the option pool for any one of
College/Unit/Discipline/Person by applying the OTHER three filters' current selections and
skipping the one named in `exclude` (so a filter never narrows its own list off its own
selection). `fillColleges()`, `fillUnits()`, `fillDiscs()`, `fillPersons()` are now four thin
wrappers around this one pool. A new `refreshCascade(skip)` calls all three non-skipped fillers
in a fixed order (College -> Unit -> Discipline -> Person, matching the order used everywhere
this needs a deterministic single pass rather than a true fixed-point iteration - acceptable
since each option list only needs to reflect what's CURRENTLY selected elsewhere, not solve for
mutual consistency). Every change handler (`collegeSel`/`collegeAll`, `unitSel`/`unitAll`,
`discSel`/`discAll`, `personSel`/`personAll`, the Unit Type switch, Clear Filters, and initial
page load / `restoreShared()`) now calls `refreshCascade()` so any one filter changing
immediately re-narrows the other three's option lists, in both directions (e.g. selecting a
College narrows Unit, but selecting a Unit also narrows College back down to just the
college(s) that unit belongs to).

Select Person(s) (`.ctl.ponly`, Person level only - `personSearch` type-ahead + `personSel`
multi-select + `personAll` button) is keyed by `PersonId` (confirmed same ID scheme as
details_table.html's `facultySel`/`sp`/`cp` values, both traced to the same SAS `PersonId`
column) and persisted to shared sessionStorage under `facultyIds` - the exact field name
details_table.html already reads/writes for its own Select Faculty - so selecting people on
either page carries the selection to the other automatically, same as every other shared
filter. `applyEntityFilters()`, `saveShared()`, `restoreShared()`, and `clearFilters` all
updated accordingly.

Validated with a synthetic-data jsdom harness (4 people / 3 units / 2 colleges / 3 disciplines,
deliberately including one dual-unit person to exercise the pipe-joined multi-value fields):
confirmed College narrows Unit/Discipline/Person, Unit narrows College back down (reverse
direction) plus Discipline/Person, Person narrows College/Unit/Discipline, Clear Filters
restores every list to its full baseline, and the `facultyIds` sessionStorage round-trip
correctly re-selects the same person on a simulated fresh page load. All checks passed.

Separately investigated a same-session report of "the sort order reverted, it's not descending
by year anymore" - re-read `fillYears()`'s comparator directly from the live file
(`(a,b)=>b.localeCompare(a,undefined,{numeric:true})`) and confirmed by direct execution that
it is, and remains, correctly descending (most recent year first); no code path touched by this
session's edits affects year ordering. Flagging as likely a stale/cached page view rather than
a code regression - if it recurs after a hard refresh, needs a fresh repro (which page, which
control) since nothing in the current source reproduces it.

Also worth noting for future sessions: this session hit the documented OneDrive-sync-race quirk
firsthand mid-edit - the shell (bash) mount briefly showed a stale, mid-statement-truncated
snapshot of `counts_simple.html` that lagged behind several just-made Edit-tool changes, while
the Read tool (app-side) correctly showed the full, current, correctly-terminated file the
whole time. Cost some wasted investigation before recognizing it.

**Update, same day:** this one turned out to be more than a transient shell-side lag. The user
reported "the counts page is back to the old version" right after the above - checked again and
the ACTUAL on-disk file (not just the shell's cached view of it) was genuinely truncated at
5,212,098 bytes, cut off mid-statement inside the `levelSeg` click handler
(`sort.k=(level==='institutio`), with everything after - the rest of the event wiring,
`restoreShared()`, the init calls, and the closing `</script></body></html>` - simply missing.
Since a JS syntax error anywhere in a `<script>` block prevents the ENTIRE block from executing,
this meant none of the page's JS ran at all: empty dropdowns, empty table, no interactivity -
which is presumably what read as "the old version" to a quick glance (nothing populated, so it
looked unstyled/reverted rather than broken). Root cause: same class of issue as the earlier
"large single write truncates the file" incident from earlier this session - one of the
in-session Edit-tool calls partially wrote past this point before something interrupted it,
and unlike the earlier incident this one wasn't re-verified end-to-end afterward.

Fixed using the same recipe as before, done more carefully this time: (1) located the exact
byte offset of the data blob's closing `</script><script>` boundary in the broken file (that
part - the 5.17MB JSON blob - was intact); (2) wrote the correct JS tail (everything from
`const D=JSON.parse(...)` through `</html>`) to a fresh file via the Write tool; (3) verified
that tail's JS syntax in isolation with `node --check` before touching the real file; (4)
concatenated head+tail and validated the RESULT (byte length, `</html>` ending, data blob
JSON-parses with the expected 1,270 person rows / 36 unit rows, and string-checked for
`Select Person(s)`/`refreshCascade`/`facultyIds` all being present) before overwriting the live
file directly through the shell (not through another large Edit-tool call, to avoid repeating
the same failure mode); (5) re-verified the live file post-write, both shell-side and via the
Read tool. Confirmed clean both ways.

**Takeaway for next time:** after ANY edit to this file that adds substantial new tail content
(new functions, new event handlers, etc.), explicitly re-verify the file ends with `</html>`
via a direct byte-level check (`tail -c` / `wc -c`) - don't assume an Edit tool success message
means the full chain (app -> disk -> OneDrive sync) completed cleanly. This project's own
`qa/README.md` already calls this out; this session is a second concrete instance of it.

## 2026-07-10 (even later) — Bug fix: phantom restored filter values silently zeroed out results

User report: selecting a Unit at Person level sometimes showed "No results for this filter"
even though the unit clearly had qualifying people. Root cause: `fillDiscs()`/`fillUnits()`/
`fillColleges()`/`fillYears()` only used their restored/previous filter value to decide which
`<option>`s to mark `selected` - they never checked whether that value still matched a
CURRENT option. A leftover value (e.g. a Discipline saved to `sessionStorage` from an earlier
session, or from viewing a different Unit Type) stayed live in the filter logic even when
nothing was visibly highlighted in the dropdown, silently filtering out rows with no visible
cause. Reproduced with real data (trimmed to the "Anthropology Program" unit, 3 qualifying
people) plus a seeded phantom `discipline` value in `sessionStorage`: the bug cut the correct
3-row result down to 1 (would go to 0 depending on the phantom value); after the fix, all 3
render correctly. Fixed by having each of the four fill functions re-derive its filter
variable from `selectedValues()` on the just-rebuilt `<select>`, immediately after building
it - the filter state can no longer diverge from what's visibly shown.

## 2026-07-10 (latest) — Counts page: "Department" Level renamed "Unit"; Institution row shows only Intra/Inter

Two small follow-up requests. (1) The Level segmented button labeled "Department" now reads
"Unit" (internal `data-lv="department"`/`D.department` key unchanged - display text only,
matches how the button already narrows to whichever Unit Type - Department or Program - is
selected, so "Unit" is more accurate than "Department" was). (2) The Institution row (MIT)
now shows only Intra and Inter columns, not the full Within/Across/Inter/Intra/All set -
Institution's "Across" is always empty (nothing above the whole institution to be "across"
from), so Within and Intra would just duplicate each other there; showing only Intra/Inter
avoids that redundancy. New `statCols()` helper picks the column set per level; `buildHead()`,
`render()`, and `downloadCsv()` all read from it instead of a hardcoded 5-column list.
Verified via jsdom: Institution view renders exactly 4 columns (#, Entity, Intra, Inter),
zero JS errors.

## 2026-07-10 (later still) — Counts page visual overhaul + full filter-data pipeline extension

User feedback after the filter-parity pass above: "I really don't like the design. Can you
replicate the filter fields exactly. take out the institution level count cards out and just
make it an option on the selector to see the institution." Then, in a follow-up
`AskUserQuestion`, confirmed extending the data pipeline now (rather than deferring) so the
four remaining flagged filters (College/School, Person-level Unit(s), Year(s), Title/Detail
contains) could be fully wired, not just flagged.

**Data pipeline**: wrote `sas/build_counts_simple_v4.py` (supersedes v3 as the build script;
output filename kept as `data/counts_simple_v3.json` — no reason to churn the already-live
blob name over an internal version bump). Adds: top-level `years`/`titles`/`details` arrays
(parallel to the existing `typeIdx`/`nAuthors`/`interdisc`, first-seen-per-work, sourced from
details_base.csv's Year/Collab_Title/Collab_Detail columns), a `college` field on
department/college rows (first-seen College per UnitId), and `college`/`units` fields on
person rows (pipe-joined, same convention as the existing `disc` field). Ran chunked (2
calls, ~2.8M rows) — Physics spot-check still exactly 948 within / 192 across (byte-for-byte
same core formulas, just re-run end to end), college resolved correctly to "Science, School
of", years/titles populated for all 16,747 works. New checkpoint filename
(`build_counts_simple_v4.checkpoint.pkl`) deliberately used instead of resuming v3's stale
leftover checkpoint (incompatible state shape — same KeyError class of bug hit earlier this
session, avoided this time by not reusing the old file).

**`sas/build_counts_simple_export.sas` (the real SAS path, task pending user run) was NOT
yet updated to match this new schema** — flagging this explicitly so it doesn't silently
drift further out of sync with the Python build; needs the same College/Year/Title/Detail
additions before the user's eventual SAS run would produce a fully matching output.

**Visual redesign**: user said the page's look didn't match Details and asked for the filter
fields to be replicated exactly, so the whole `<style>` block and header/controls markup
were rebuilt to mirror `details_table.html`'s actual CSS (same `--navy`/`--ink`/`--bg`
palette, same `.ctl`/`.seg`/`.btn`/`.chkgrp`/`.sidegrp` classes and hint-tooltip pattern) —
not just functionally equivalent controls, the same visual language. Work Type changed from
toggle buttons to real checkboxes in a `.chkgrp`, matching Details' exact widget. New
controls added with this pass, using existing + newly-built data: **Select
College(s)/School(s)** (multi-select, filters department/college/person rows by the new
`college` field), **Select Unit(s) now also works at Person level** (previously
Department-only; uses the new `units` field, `.unitctl` CSS-gated to show at Department OR
Person level), **Select Year(s)**, **Title contains**, **Detail contains** (all three filter
at the WORK level via `passWork()`, same mechanism as Work Type/max-collaborators/interdisc).

**Institution cards removed**: the old always-visible `.cards`/`#miteCards` block
(`renderMitCards()`) is gone entirely. **Institution is now the first Level option** (added
ahead of College/School per `DECISIONS.md`'s "Level pickers ordered BIG → SMALL" rule — MIT
institution is the biggest grain, so it leads) — selecting it renders the exact same
Within/Across/Inter/Intra/All table as every other level, just with MIT's one row, using
`D.institution[uk]` (already existed in the v3/v4 schema, no data change needed for this
part — `rowsForRaw()`'s generic `D[level][uk]` lookup already covered it).

Verified via a rebuilt jsdom harness with synthetic data covering every new field (college,
units, years, titles, details): Institution level renders exactly 1 row; College filter
narrows Department rows correctly; Person-level Select Unit(s) correctly filters by the new
`units` field; Year/Title/Detail filters apply at the work level; Work Type checkboxes
correctly refuse to let the last one be unchecked; Clear Filters resets every field including
the 4 new ones; the full save→sessionStorage→reload round-trip includes all new shared
fields (`colleges`, `years`, `titleQ`, `detailQ`) with the exact same field names
`details_table.html` uses. Zero JS errors.

## 2026-07-10 (later) — "Counts (Simple)" renamed to just "Counts" sitewide

User: "remove (simple), leave it as counts everywhere." Now that `counts_table.html`
("Counts (Partners)") is retired, there's no second "Counts" page left to disambiguate
against. Updated the nav link text on every page that carries it (chord_viz.html,
counts_simple.html, insights.html, matrix_viz.html, network_viz.html, details_table.html,
intl_details_table.html, intl_map.html, key.html), plus key.html's TOC entry, section
heading, and two body mentions, plus counts_simple.html's own `<title>` and `<h1>` (both
said "Simple Counts", reversed word order — caught both). `DECISIONS.md` updated with a new
"Page naming" note. Filename (`counts_simple.html`) and internal script/data names
(`build_counts_simple_v3.py`, `counts_simple_v3.json`, `SHARED_FILTER_KEY`'s field names,
etc.) intentionally untouched — only user-facing text changed. Did NOT touch the two
non-live files (`network_viz_backup_2026-07-09_pre-features.html`,
`qa/details_testcopy.html`) that still say "Counts (Simple)" — they're a dated backup and a
stale QA copy, not part of the live site.

## 2026-07-10 (later) — Cross-page session filter persistence + Counts filter-parity pass

Two requests in one go: (1) "filters ... stick for my session" when moving between pages,
and (2) "duplicate the exact filter layout from the details page on to the count page ...
let me know if it doesn't [apply]."

**Persistence**: added a shared `sessionStorage` object (`aad2024_shared_filters`, clears
when the tab closes — matches "for my session") to both `details_table.html` and
`counts_simple.html`. Each page reads/writes only the fields it understands via
`loadSharedFilters()`/`saveSharedFilters()` (identical tiny helper in both files) — no page
needs to know the other's full filter model. Shared fields: `unitType`, `units` (unit-name
keyed, not id, so it round-trips between the two pages' different row shapes), `discipline`,
`interdisc`, `types`, `maxCollab`. Details-only fields (`colleges`, `collabDiscipline`,
`years`, `titleQ`, `detailQ`, `facultyIds`) are saved too, for its own return-to-this-page
continuity, even though Counts doesn't read them. Restoration runs once per page load,
before the first render — on Details, a saved Unit Type is applied by synthetically
clicking the right `#uk` button (which itself triggers `loadMode()`) before the very first
load; on Counts, applied directly since the data's already embedded (no fetch needed).

**Counts filter-parity audit** — went through every Details-page filter control and
classified each by whether/how it maps onto Counts' aggregate (per-entity-rollup) data
model, since the two pages have fundamentally different grains (Details = one row per
scholar-work-collaborator triple; Counts = one row per department/college/person with
`[workIndex, pairCount]` arrays). **Implemented today** (used existing data, no rebuild):
- **Interdisciplinary** upgraded from a binary toggle to the same 3-way All/Yes/No dropdown
  Details already has.
- **Select Unit(s)** — new multi-select, Department-level only (rows there already ARE
  per-unit, so this just narrows which rows show; keyed by unit *label* to match Details'
  own name-keyed filter and round-trip through shared storage).
- **Select Discipline(s)** — upgraded from a single-select to a real multi-select (match ANY
  selected discipline), matching Details' plural "Select Discipline(s)" naming and behavior.
- **Clear Filters** button — added (was missing entirely).
- Relabeled controls to match `DECISIONS.md`'s exact filter-title/button-text conventions:
  "Work type" → "Select Collaboration Type(s)", "Max co-authors per work" → "Max
  collaborators/work", "↓ CSV" → "↓ Download Data (CSV)".

**Flagged as NOT implemented** (need new backend data or don't structurally apply — user
said to flag rather than force):
- *Needs a data-pipeline extension* (details_base.csv already has the source columns, just
  not carried into `counts_simple_v3.json` yet): **Select College(s)/School(s)** (no college
  tag on department- or person-level rows currently), **Select Unit(s) at Person level** (no
  unit-membership tag per person currently — only works at Department level today, where
  rows already are units), **Select Year(s)**, **Title contains**, **Detail contains** (no
  year/title/detail carried per work in the v3 schema — only type/author-count/interdisc
  flags). Rebuilding these means extending BOTH `sas/build_counts_simple_v3.py` (the Python
  stand-in) and `sas/build_counts_simple_export.sas` (the real SAS script, so the two don't
  drift out of sync) plus a full data re-run — a real scope decision, not done without
  asking first.
- *Doesn't structurally apply, even with more data*: **Select Collab Discipline(s)** (would
  need a per-collaborator-discipline breakdown per work per entity — Counts' rollup has no
  collaborator-level granularity at all); **Select Faculty** as a cross-cutting filter (would
  need per-work person-ID tracking in the `[workIndex, pairCount]` arrays — currently just an
  index and a count); the **Faculty/Collab column Show/Concat grids** (Details-specific:
  controls which per-pair metadata columns render — Counts' rows are already single
  aggregate entities, nothing to explode); the **"One row per work" / unique-works toggle**
  (Details-specific: collapses per-pair detail rows to one row per work — Counts has no raw
  per-pair rows to collapse in the first place; its "Level" selector already serves the
  closest analogous purpose).

Verified via jsdom against a synthetic dataset covering every new code path (level/unit-type
switches, multi-select discipline, unit narrowing, 3-way interdisc, max-collab cap, CSV
export, Clear Filters, and a full save→sessionStorage→reload round-trip) — zero JS errors.
Did not re-verify `details_table.html`'s persistence hooks via jsdom execution (would need
the same mocked-fetch/trimmed-anchors harness as its earlier fix this session) — verified
instead via a careful manual line-by-line read of every changed region (same fallback
precedent as the 2026-07-08 entry above, for when the shell mount lags behind app-tool
edits — confirmed happening again today, see note below).

**Environment quirk recurrence**: `counts_simple.html`'s shell-mounted copy showed the file
truncated mid-`render()` function immediately after several edits, while the Read tool
showed the complete, correctly-closed file ending in `</html>`. Same documented "app-tool
edits invisible to shell" quirk (`qa/README.md`) — confirmed via the Read tool, not
re-litigated.

## 2026-07-10 — counts_simple.html migrated off the prototype pipeline onto SAS (details_base.csv)

User asked to retire the old MITCollabs-prototype counts pipeline entirely and move
everything onto the SAS-sourced pipeline, then asked how the python (`build_counts_simple3.py`)
computed counts and whether to shift `counts_simple.html` to SAS. That script isn't available
in this sandbox/repo (lives in the un-mounted `../MITCollabs` sibling) - confirmed via
`sas/counts_simple_sas_check.sas`'s own comment and the live page's 16,738-work total that it
was prototype/`collabs.csv`-sourced, not `details_base.csv`. Recommended the SAS migration
since `details_table.html`/`matrix_viz.html`/chord global mode already made this exact move,
and it resolves the open `DECISIONS.md` item ("rebuild from SAS or document convention").

**No SAS engine is available in this sandbox** (SAS itself only runs on the user's machine),
so `sas/counts_simple_sas_check.sas`'s formulas were re-implemented in Python instead:
- `sas/build_counts_simple_v2.py` - flat entity-level rollup (validation-only script, mirrors
  the SAS check script's formulas exactly). Confirmed Physics 948 within / 192 across and MIT
  institution all_works=16,747 (the SAS work universe, up from the prototype's 16,738) -
  within_collabs=5,561 for Physics also matches `network_viz.html`'s independently-validated
  figure exactly, a strong cross-check.
- `sas/build_counts_simple_v3.py` - the production build. Discovered mid-task that the live
  page's embedded data is genuinely work-grain (per-work type/author-count/interdisc flags,
  plus per-entity `[workIndex, pairCount]` arrays), not flat totals - this is what drives the
  Work Type checkboxes, "Max co-authors per work" cap, and Person-level/Discipline drill
  entirely client-side. User chose full parity (not a flags-dropped shortcut), so v3 rebuilds
  that exact shape from `details_base.csv`, adding a NEW person-level rollup (the old SAS
  check script never covered person grain) using the same "MIN(rel) any-overlap-wins"
  convention already validated elsewhere (network_viz's pair-grain match). Two ASSUMPTIONS
  had to be reverse-engineered since `build_counts_simple3.py`'s exact source isn't available -
  flagged for the user, but both check out extremely closely against the live page's own old
  data: `nAuthors[wid]` (total distinct MIT+external people per work) matches the old data's
  max/min EXACTLY (292/2 both sides); `interdisc[wid]` (MIT co-authors spanning >1 distinct
  Discipline) gives 68.6% of works flagged vs the old data's 68.9% - within the expected
  16,747-vs-16,738 work-universe variance, not an exact-match guarantee.
- Patched `counts_simple.html`'s embedded `<script id="data">` blob in place with the v3
  payload (same precedent as matrix_viz/chord global's "rebuild, patch the blob in place"
  migration - no fetch-at-runtime needed, 2.7MB embeds fine, zero client JS changes since the
  output schema matches exactly). Also fixed the footer citation, which had drifted out of
  compliance with `CLAUDE.md`'s "never print institutionid 123 in UI text" rule (was "Source:
  collab.py ... MIT (institutionid 123)") - now credits SAS `details_base.csv`, no id.
- Verified via jsdom (no canvas needed, this page is a plain table): 36 department rows,
  Physics renders 948/5,561 within, 192/379 across, 2,788/349,029 inter (all match the build
  script's own numbers exactly), person-level (1,270 people), interdisc toggle, and CSV export
  all work with zero exceptions. One harness-only limitation, not a page bug: jsdom has no
  `URL.createObjectURL`, same class of no-browser-sandbox quirk already documented in
  `qa/README.md` for other pages.

**Not done / explicitly deferred:**
- `counts_table.html` itself is still not deleted from the OneDrive `collab-mit` copy -
  `allow_cowork_file_delete` still errors "could not find mount" (retried this session); this
  session's sandbox only had `C:\dev\collab-mit` connected, not the OneDrive folder, so this
  isn't a transient tool issue - it needs the OneDrive folder connected in a future session, or
  manual deletion by the user.
- `chord_viz.html`'s anchored mode still uses the portal partner-summed convention (Physics
  238-partner breakdown sums to 231 across / 31,991 inter, vs the true distinct 192/2,788).
  Investigated its render code: a ribbon diagram is inherently pairwise (one ribbon per
  anchor-partner pair), so partner-summing above the true distinct total is a structural
  property of this chart type, not itself a bug the way the old matrix's wrong cross-unit
  cells were (that fix corrected an actually-wrong number, not the summing behavior). Presented
  this distinction to the user; they chose to leave chord_viz anchored mode as-is for now
  rather than force a rebuild that wouldn't really achieve "distinct-works" semantics for a
  per-partner ribbon anyway.

## 2026-07-10 — details_table.html: default sort order + search/filter overhaul (dev copy only)

Three user requests, all in `C:\dev\collab-mit\details_table.html` only - **not yet synced to the
OneDrive `collab-mit` or `MITCollabs` copies** (same dev-first pattern as network_viz.html; sync on
request).

1. **Default sort order** — was Faculty Name primary with Total Collaborators as the tie-break;
   changed the tie-break chain to Faculty Name → Collaboration Type → Year, per request. This
   applies to whatever column the user actively sorts by too (it's the tie-break for ties on the
   active sort column, not just the untouched default).
2. **Collaboration-type checkboxes** reordered into a 4-column grid (Article/Conf. Proceeding,
   Book/Book Chapter, Grant, then Patent/Clinical Trial) instead of the old alphabetical wrap — a
   separate same-day request, done first.
3. **Search/filter overhaul**: removed the single fuzzy "Search" box (`q`) that matched scholar
   name + collaborator name + title + depts all at once. Replaced with: a "Title contains" box
   (title only, mirrors the existing "Detail contains" box which already searched detail only) and
   a proper **Select Faculty** multi-select dropdown (matches by scholar pid, not fuzzy text) with
   its own in-box search input (`facultySearch` — purely visual, hides non-matching `<option>`s
   without touching selection, so a hidden-but-selected option stays selected). The Faculty
   dropdown's option list narrows to whoever still has a qualifying row under every OTHER active
   filter (`refreshFacultyOptions()`, called from the shared `onFilterChange()` so it stays in sync
   automatically) — same idea as the existing College→Unit cascade, generalized to all filters via
   the same `passesWorkFilters`/`passesGroupFilters` functions with the faculty filter zeroed out.

**Verification note:** the bash/shell mount showed this file truncated mid-function (1013 lines,
cut off inside `onFilterChange`'s wiring block) immediately after these edits, while the Read tool
consistently showed the complete, correctly-closed 1068-line file ending in `</html>`. This is the
same mount-lag issue previously seen only on the much larger `network_viz.html` (~30MB) —
[[feedback-sandbox-quirks-large-csv-processing]] — now confirmed to also happen on a ~57KB file
after enough same-session edits. Trusted the Read tool per that precedent; did a full manual
line-by-line structural read instead of a bash-based `node --check`.

## 2026-07-10 — Bug fix: fingerprint panel "Articles" (and other type) counts wildly inflated

User-reported ("this articles number doesn't seem right"): Sara Seager's fingerprint panel showed
1481 Articles against 142 collaborators / 1,492 total work-links - implausible for an actual
distinct-article count. Root cause: `buildFingerprintHtml()`'s `typeTotals` summed each
collaborator's `ptypes[i]` (a per-PAIR count) across all collaborators, so one large
multi-co-author paper (Seager works in big survey/consortium collaborations) got counted once per
co-author instead of once - the exact same Works-vs-Collaborations multiplicity mechanism just
fixed in `counts_simple.html`'s methodology note the same day.

Fixed by switching to the same distinct-wid-dedup pattern already used by the by-year sparkline
just below it: walk every collaborator's `wids`, dedupe into a `Set`, look up each work's type via
`D.works_meta[wid][2]`, and count once per distinct work. Caveat carried over from the sparkline's
own known limitation: `wids` are capped at 8 per collaborator pair in the source data
(`build_network_viz.py`'s `wids[:8]`), so this is a lower bound, not exact - labeled "Work types
(distinct works, capped sample)" in the UI so it doesn't read as a precise total. Verified
standalone: a synthetic 20-collaborator/1-shared-paper case that used to inflate 3 real distinct
articles to 24 now correctly returns 3.

Also shortened the ego-view legend note (was wrapping the whole legend panel too wide) and capped
`.legend`'s width at 230px so a future long note can't do the same thing again.

## 2026-07-10 — Ego view redesigned: blobs instead of concentric rings, no connector lines

User feedback: the old ego view (click one scholar → concentric within/across/inter rings, points
placed radially) was "too constricted due to the circles" and didn't need connector lines from the
center person, since by construction every shown person IS connected to that one center person.

`applyEgoFilter(pid)` rewritten: each rel bucket (within/across/inter) is now grid-packed into a
wide ellipse "blob" (`CELL_W=140,CELL_H=26,MAX_COLS=7,ASPECT=1.6`, `gridFor(n)` sizes the grid so
capacity is never short and never wastes more than one row) instead of being placed on ring radii.
Up to 3 blobs sit left-to-right, vertically aligned and horizontally centered as a group; the ego
person is centered above the row and flagged `isEgoCenter:true` so `nodeR()` (fixed r=15) and the
node-border-highlight logic in `draw()` (`nd.is_anchor||nd.isEgoCenter`) both give it a distinct,
prominent look without needing it to also be an anchor-unit scholar. Layout stays deterministic —
`draw()` is called directly, never `startSim()`, so the physics sim never perturbs the grid (same
precedent as the two-anchor compare view).

`drawEgoZones()` rewritten to draw `ctx.ellipse()` blobs instead of `ctx.arc()` rings, with
within/across getting a thick solid outline (3.4/zoom, alpha 0.8) and inter a thin dashed one
(1.5/zoom, alpha 0.55, dash `[5,4]/zoom`) — the border weight itself now signals internal vs
external, per the user's request, not just color. `draw()`'s main edge-drawing loop is skipped
entirely when `egoActive` (no lines from the center — they were redundant by construction).
Legend section reworded from "ring" to "zone" language and now explains the border-weight meaning.

Verified: standalone Node test of `gridFor()` across n=0..500 (capacity always ≥ n, never more
than one wasted row); manual Read-tool pass over `applyEgoFilter`, `drawEgoZones`, `nodeR`, the
node-border block in `draw()`, and `renderLegend()` confirming correct wiring end to end.

## 2026-07-10 — Removed the "Counts (Partners)" page (`counts_table.html`) site-wide

User: "Take out the partners count page completely." Removed the nav link from every remaining
page (details_table.html, key.html, matrix_viz.html, chord_viz.html, insights.html,
intl_details_table.html, intl_map.html, base_template.html) across all 3 copies (dev, OneDrive
collab-mit, MITCollabs), deleted `counts_table.html` itself from dev and MITCollabs, and reworded
`counts_simple.html`'s methodology note (it used to link to Counts (Partners) as a comparison
point) to stand on its own. **Not yet done:** `counts_table.html` still exists in the OneDrive
`collab-mit` folder — `allow_cowork_file_delete` errors "could not find mount" for that specific
mount no matter the path format tried (works fine for the other two mounts), and a direct `rm`
there returns "Operation not permitted" (per [[onedrive-sync-race-truncation]] / the OneDrive
delete-protection rule in CLAUDE.md). User should delete that one file manually, or ask again in
a future session in case the mount-name issue was transient.

Also fixed, while in `counts_simple.html`: the "Collaborations" methodology note used a misleading
example ("a pair sharing 270 papers contributes 270, not 1") — the user pointed out that a single
two-person pair repeating across 270 papers actually gives identical Works and Collaborations
counts (270 = 270), so the example didn't illustrate any real difference. Checked
`build_counts_simple3.py`: Works = distinct paper count; Collaborations = sum of `pair_count` per
paper, where `pair_count` = C(m,2) for within (m = qualifying co-authors on that one paper in that
category). The real divergence comes from papers with **more than 2** qualifying co-authors, not
from a pair repeating — reworded the note to a correct example (1 paper, 5 qualifying co-authors →
1 Work but C(5,2)=10 Collaborations).

## 2026-07-09 (8) — New: collaboration "fingerprint" panel on every person's detail panel

`buildFingerprintHtml()`, inserted into the existing person-level detail panel right below the
summary line. For the selected person: an SVG donut (within/across/inter work-share, 3
stroke-dasharray segments on one circle - circumference ≈100 at r=15.9 so percentages plug in
directly as dash lengths, no arc-path math), mini bars for Article/Grant/Patent/Book/Clinical work
counts, top 5 collaborators, top 5 partner institutions (aggregates Inter-rel collaborators by
institution name, working whether or not "roll up externals" is on), a repeat-collaborator rate
(% of collaborators with 2+ shared works, not just one paper together), and a Bridge Score -
**reused directly from `computeBridgeMap()`/`bridgeTier()`** (the Bridge People map's own scoring,
entry (7) below) rather than re-derived, so the two features agree and the bridge computation's
one-time cost is paid once regardless of which view triggered it first.

Derives a small set of descriptive labels (a person can get more than one): Cross-department
bridge (bridge score ≥2), External connector (≥40% of work-share is inter-institutional),
Grant-heavy collaborator (≥30% grant work-share with ≥3 actual grants), One large consortium
contributor (50+ collaborators but ≤1.5 avg works-per-collaborator - many one-off co-authors,
the same giant-paper pattern flagged in entry (7)'s bridge-score design note), Sustained repeat
collaborator (≥40% of collaborators are repeats), falling back to "Internal specialist" if none
of those fire. Verified standalone against 4 synthetic scenarios (bridge+external mix, a
60-one-off-collaborator consortium pattern, a mostly-within repeat-collaborator pattern, and the
empty-collabs edge case) - percentages sum to 100, sort orders correct, each label pattern fires
on its intended scenario and nowhere else, no exceptions.

## 2026-07-09 (7) — New view: "Bridge People" map in network_viz.html

New 5th Level option ("Bridge People", alongside College/School, Department, Anchor, Person)
answering "who connects otherwise-separate MIT units?" - the user's own framing, from a mockup
showing department clusters with brokers pulled between them. User explicitly chose the heaviest
of three scoping options offered (individual-department-level, all of MIT) knowing it could get
dense, over a School/College-level default or an N-department picker.

**Computed entirely client-side, no new data pass.** Reuses `buildGlobalAdjacency()` (built for
shortest-path) plus a new inverted index over `D.anchor_pids` to find each person's home
Department-kind unit (via `D.dept_graph`'s 30 canonical department nodes) or, for external people,
their institution (`D.people[pid][2]`). For every person, walks their global neighbors and counts
**distinct OTHER MIT departments reached** - this count, not raw edge/work volume, is the bridge
score. Chose distinct-department-count over work-volume deliberately: an early version scored by
summed cross-cluster works, and a Physics/CMS-consortium physicist came out with a score of
~51,000 purely from being on giant 100+-institution particle-physics papers - a volume metric gets
swamped by consortium science and stops meaning "broker," while distinct-department-count still
correctly surfaced real brokers (e.g. an EECS professor with real ties into Aero/Astro, Civil/Env,
and Physics individually). Tiers are fixed thresholds (Low=1, Medium=2-3, High=4+), not
percentile-based - real score distributions are heavily skewed toward small integers (most people
who bridge at all bridge exactly 1 other department), so percentiles collapse together at the low
end and read poorly.

**External institutions** get the same hard cap that already proved necessary for compare-mode
performance: top 12 by distinct-MIT-people-connected, no exception. First tried letting an
institution in regardless of rank if it was the home of a genuine bridge person - even requiring
that person's own score to be >=3 still let ~30 institutions leak past a cap of 12 in testing
(consortium papers again: a great many individual external co-authors each pick up a small nonzero
cross-department score from paper overlap alone). A flat top-12 cap is simpler and predictable
regardless of how consortium-heavy the currently-visible department mix is; externals outside the
cap are folded away entirely (not rendered, though they still count toward their MIT
collaborators' own bridge scores and "has external ties" flag).

**Layout is fully deterministic - no continuous force simulation at all**, applying the same
lesson learned fixing the two-anchor compare view's timeout (see entry (4) below): clusters are
arranged in a ring around the canvas center; non-bridge people (shown only in "All People" mode,
default is "Bridge People Only") sit in a tight jittered ring around their own cluster; bridge
people sit at the position-weighted centroid of their home cluster plus every cluster they bridge
to. This is O(n) regardless of node count, so a busy department mix costs nothing extra to render.

**New UI**: `#bridgeCtrls`' Bridge People Only / All People toggle (hides the normal
anchor/scope/type controls, which don't apply to this global view). Click a bridge person to see
which departments they connect (own detail-panel branch, since this view doesn't retain
person-to-person edges - it explicitly points the user to switch to Person level + search for the
full collaborator-by-collaborator breakdown). Legend gets its own Bridge Score / Connection Type
section. Border glow (dashed purple ring) flags people who also have external/inter-institutional
ties, independent of their department-bridge score.

**Verified**: the scoring/clustering algorithm was validated standalone against a real 6-department
trimmed extract (Physics, EECS, MechE, Aero/Astro, Civil/Env, Applied Ocean Physics) - correctly
surfaced known multi-department bridges (e.g. an EECS professor bridging 4 other MIT departments
plus external ties), finite positions/radii for every node, and the institution cap holding at
the intended ~12 (not the 301 seen before the consortium-leak fix). The full wiring (HTML control
IDs, Level-button dispatch, click/tooltip/legend branches) was manually traced end-to-end against
the live file via the Read tool line-by-line, since the sandbox's bash mount of this file lagged
behind app-side edits all session (see [[onedrive-sync-race-truncation]] and the sandbox-quirks
memory) badly enough that a full jsdom splice test kept failing on a stale copy, not a real bug -
not a substitute for opening it in a real browser, so flag anything that looks visually off.

## 2026-07-09 (6) — generalized institution rollup into 3 independent toggles

Added "Roll up within-unit by dept." and "Roll up across-MIT by dept." checkboxes alongside the
existing "Roll up externals by institution" one. Refactored `rollupExternalNodes()` into
`rollupNodesByGroup()`: buckets each partner node as ext (rank 4) / across (MIT, not anchor
member) / within (anchor member), grouped by `nd.extra` (institution for ext, department for the
other two), each gated by its own checkbox so they combine freely. Reused the existing
`isInstRollup`/`memberPids` shape for all three so the detail-panel and tooltip per-type-breakdown
fix from entry (5) above covers all three automatically (that code only checks `isInstRollup`, not
which bucket). Verified the merge/grouping logic standalone against synthetic fixtures: anchor
node untouched when within-rollup is off, same-department across-partners merge with summed
works, same-institution externals merge, and a solo (1-member) institution still wraps correctly.
Compare-mode entry now resets and unchecks all three (previously only reset external).

## 2026-07-09 (5) — bug: institution-rollup rows showed Total correct but every type column 0

User caught this on Sara Seager's detail panel: "Princeton University" row showed Total=244 but
Articles/Books/.../Clinical all read 0. Root cause: `rollupExternalNodes()` correctly merges
`link.works` (and `pairs`) when folding same-institution external nodes into one synthetic
`__inst__:<name>` node, but the per-type breakdown in `showDetailPanel()`'s `collabs` map was
still doing a single `pairEdgeCache[pk]` lookup keyed on `[nd.pid, on.pid].sort().join(':')` —
for a rollup row `on.pid` is the synthetic string, which never matches a real pairEdgeCache key,
so every type column silently read 0 while Total (sourced from the already-merged `link.works`,
a different code path) stayed correct. Fixed by summing the per-type breakdown (and `wids`, which
had the same bug affecting the "Collaborative Works" section) across every real person in
`on.memberPids` when `on.isInstRollup`. Verified via jsdom: 0 mismatches between Total and
sum(type columns) across all 81 of Seager's collaborator rows (71 of them rollups).

## 2026-07-09 (4) — two post-ship fixes: compare-view spacing + invisible path-finder inputs

- Compare view clusters were too far apart (26%/74% of canvas width) per user feedback; brought
  to 35%/65% in `buildOneAnchorSide()` calls, the matching `simulate()` gravity target, in
  `buildCompareGraph()`. Re-verified against the Physics+EECS trimmed set: sides stay separated,
  zero cross-side links, click-to-exit-compare still works.
- Path-finder "From"/"To" inputs (`#pathFromInput`/`#pathToInput`) were effectively invisible —
  they reused the generic `.search-bar input[type=text]` rule, which is styled for the dark blue
  *header* bar (white text on a near-transparent white background, near-invisible border) but the
  path panel is a white floating card, so the input rendered white-on-white — user reported "it's
  all greyed out I can't type in it" (they were actually seeing/clicking the static `.path-slot`
  div below the invisible input, not the input itself). Fixed with a scoped override,
  `.path-panel .search-bar input[type=text]`, using the light-panel palette (dark ink text, white
  background, `--line` border) instead of the header palette.

## 2026-07-09 (3) — network_viz.html: 5 new features + ego-ring legend

Built in one sitting per the user's explicit picks from a 6-idea list (shareable-link idea NOT
built, not requested). All five validated via jsdom against trimmed copies of the REAL embedded
data (Physics-anchor for most; a fresh Physics+EECS two-anchor trimmed set for compare mode) using
the reusable `/tmp/splice_netviz_test.py` splicer. Zero console errors across all tests.

1. **Name search** — search bar under the page title (`#personSearch`/`#personSearchResults`),
   backed by `PEOPLE_SEARCH` (flat array from `D.people`). Picking a result calls
   `jumpToPersonEgo(pid)`, which finds that person's home anchor via `findAnchorKeyForPid()`
   (prefers a Department-kind unit; falls back to scanning `edges_cap['all']` for people with no
   home unit, e.g. external collaborators), switches the anchor/unit-kind selects if needed, and
   enters ego view centered on them. Reused the same search-dropdown widget
   (`createPersonPicker()`) for the path-finder pickers below.
2. **Shortest-path highlighting** — `#pathFinderBtn` opens a from/to picker panel; BFS
   (`bfsShortestPath`) runs over a lazily-built, deduped global adjacency graph
   (`buildGlobalAdjacency()`, merged from every anchor's `edges_cap['all']`, using `Math.max` not
   sum across overlapping anchor-derived duplicates so counts aren't inflated). Result renders as
   a fixed left-to-right pinned chain (`applyPathView`), no physics.
3. **Institution rollup toggle** — `#rollupExternalChk`; merges external (`rank===4`) nodes sharing
   the same institution string into one synthetic `__inst__:<name>` node with a roster detail panel
   (Person | Works w/ MIT) instead of the normal person breakdown. Guarded so clicking a rollup node
   never enters ego mode.
4. **Two-anchor compare view** — `#compareChk` + `#anchor2`, side-by-side ring clusters (left 26%
   / right 74% width) via new `buildOneAnchorSide()`/`buildCompareGraph()`. **Performance fix**:
   the first version had no cap on partner nodes (only the 60-scholar anchor cap), so comparing two
   edge-dense departments (Physics + EECS) produced 4,321 combined nodes and the O(n²) force
   simulation's 80-tick pre-run timed out in testing. Fixed two ways: (a) added a `PARTNER_MAX=100`
   cap per side (sorted by degree, same pattern as the main single-anchor builder), and (b) compare
   mode no longer runs continuous physics at all — `buildCompareGraph()` now calls `draw()` once
   against the deterministic ring layout instead of `startSim()`, so total cost is O(n) regardless
   of how dense the two chosen departments are. Re-tested against the same Physics+EECS pair:
   320 combined nodes (160/160 per side), zero cross-side links, correct header labels, sides stay
   visually separated (avg x: 312 vs 888 for a 1200px-wide canvas), `draw()` with the new dashed
   divider doesn't throw, and clicking any node correctly exits compare mode and jumps to that
   person's ego view. Known simplification: `COMPARE_MAX=60`/`PARTNER_MAX=100` per side are fixed
   regardless of the Top-N/Rank-By UI controls.
5. **Timeline sparkline** — added to the person detail panel; collects per-year distinct-work
   counts from each pair's `wids` (deduped via a `Set`) cross-referenced against
   `D.works_meta[wid][1]` for year, rendered as a small bar chart. Explicitly labeled "(sample)"
   since `wids` are capped at 8 per pair and only stored for anchor-scholar edges — not a complete
   count, by design of the underlying data.
6. **Ego-ring legend** — mid-batch user interruption asking for the within/across/external ring
   colors to be labeled. `renderLegend()`'s person-level branch now appends an explicit
   "Ego view — ring = relationship to center" section with color swatches when `egoActive`, and
   `buildGraph()` now calls `renderLegend()` at the end of every rebuild (previously only ran once
   at page load) so the legend stays in sync with ego toggles.

**Not yet done**: `build_network_viz.py` (the page's source-of-truth Python template) was NOT
updated to match any of today's hand-patches — see [[project_network-viz-page.md|network_viz.html
state note]] for why regenerating from that script would currently wipe them out.

## 2026-07-08 (3) — New page: International Collaborations Map (`intl_map.html`)

**2026-07-08 addendum (same day, after user review):** two follow-ups on `intl_map.html`.
1. Added a US State(s) filter. The source CSV has no State field at all - derived one via
   nearest-centroid classification of each US institution's geocoded lat/lon against the 50
   states + DC (`data/us_state_centroids.py`, well-known approximate geographic-center
   coordinates). This is a classification heuristic, not authoritative (a point near a state
   border can land in the neighboring state) - covers 1,866 of the 4,865 mapped institutions
   (those with `country === "UNITED STATES"`).
2. Attempted a hand-simplified continent-outline basemap after the user said the graticule-only
   version had "no map on the grid." First attempt was hand-traced from memory (not real
   coastline data) and the user immediately called it "the ugliest map I've ever seen" -
   correctly so; freehand-recalled continent shapes were visibly wrong. **Disabled it
   immediately** (the `drawContinents()` call in `draw()` is commented out, function still
   defined) rather than iterating on more guesswork. Root cause of why this had to be
   hand-traced in the first place: this sandbox's own network access can't reach the usual
   map-tile/GeoJSON CDNs, and `web_fetch` - which CAN reach them - returned results that were
   awkward/partial to extract back (e.g. one Natural Earth 110m land-polygon fetch that looked
   promising turned out, on inspection, to contain only small Pacific-island fragments, not the
   major continents - likely truncated by the tool before the big features later in the file).
   Current state: plain lat/lon graticule only, no basemap. Real coastline data would need to
   come from the user (a GeoJSON/shapefile dropped into the project folder) or a retry with a
   different fetch strategy - not attempted again without user input, given the first guess-based
   attempt already burned trust once.


Part 2 of the international-collaborations request (part 1 is [[project_intl-collabs-page|the
Details page]] added earlier the same day). Also added an "All but US" button to the Country
filter on `intl_details_table.html` per a user request that came in mid-build.

**Data**: `data/build_intl_map_data.py`-equivalent inline script (run ad hoc, not saved as a
standalone .py this round - worth extracting to a real script file if this page needs rebuilding)
aggregated `data/MitInternationalCollabsLong.csv` down to one row per collaborator institution
(`CollabInstId`): resolved lat/lon (prefers `Collab_Latitude`/`Collab_Longitude`, falls back to
`Collab_CtryMdpt_Latitude`/`Longitude` when the institution itself wasn't geocoded), country,
NAICS-derived Partner Type, plus a per-year breakdown of distinct works / distinct MIT scholars
/ citations / article-vs-conf-proc counts. MIT's own hub coordinate is hardcoded
(42.3601, -71.0942 - Cambridge campus) rather than picked from the two slightly different
`IOF_Latitude`/`IOF_Longitude` values present in the raw data (1,953,687 rows each - functionally
identical for a world-map view). Read via `pyarrow.csv.read_csv` (same pattern as the Details
page's pipeline - see that entry for why), written once to `data/intl_map_full.parquet`, then
aggregated with vectorized pandas groupby. Output: `data/intl_map_data.json`, 1.42MB - small
enough to embed directly inline (`<script type="application/json">`) rather than fetch-at-runtime.
4,865 of 5,028 institutions (96.8%) have a usable coordinate; the other 163 (3.2%) have neither a
precise geocode nor a country-midpoint fallback and are excluded from the map entirely - the
page's status bar reports this honestly rather than hiding the gap.

**Page**: canvas-based, plain equirectangular projection (`(lon+180)/360, (90-lat)/180`), pan
(drag) + zoom (wheel or +/- buttons), hover tooltip per institution, MIT drawn as a fixed hub
node with edges to every currently-shown institution. Filters: Country (+ new "All but US"
button, matching the request below), Partner Type, Work Type, Year, a "min. works with MIT"
threshold to declutter, free-text search, and a "size/color nodes by" selector (distinct works /
distinct MIT scholars / citations) that drives both node radius and edge width/opacity (sqrt
scaling for perceptual area). Validated via jsdom with a stubbed canvas context: all filters
change `filteredCache` correctly (spot-checked Non-Academic and a min-works=5 filter against
their own predicates), pan/zoom/reset don't throw, zero console errors.

**Deliberately NOT done / scope decisions** (flagged to the user, no pushback so proceeding):
- **No coastline/basemap.** This sandbox's own outbound network access doesn't reach public
  map-tile/TopoJSON CDNs (confirmed: direct `curl` and Node's `fetch` to `cdn.jsdelivr.net` both
  failed to connect) - only this app's own `web_fetch` tool reached it, and that result was too
  large to practically extract back into the sandbox through available tools. Drew a plain
  lat/lon graticule instead of coastlines - same "canvas + hand-rolled, no heavy deps" precedent
  as `network_viz.html`/`chord_viz.html`. Institution/country names are always in the hover
  tooltip regardless, so the missing basemap doesn't cost identifiability, just visual polish.
- No MIT-unit (Department/Program/OAU) breakdown on this page - adding that dimension would
  roughly 100x the embedded payload for a filter `intl_details_table.html` already covers well.
  Can be added later if wanted.
- No cross-link to `network_viz.html` (same reasoning as the Details page - person-ID space
  alignment between the two datasets was never verified, and this dataset has no
  within/across/inter concept to key an ego view off of).
- The "sum of shown works" stat in the status bar is a SUM across institutions (a work with
  co-authors at 3 institutions counts 3x here), not a distinct-works count - worded as "sum of"
  deliberately to avoid the same cross-grain-sum-as-total mistake this project has hit before
  (see [[project_collab-mit-state]] and the Details page's row-explosion incident in `HANDOFF.md`
  2026-07-04/07 entries). Get the true distinct-works number from `intl_details_table.html`.

Added to the shared nav on all 9 other pages (the 7 pre-existing ones plus
`intl_details_table.html`).

---

## 2026-07-08 (2) — New page: International Collaborations (`intl_details_table.html`)

Added to the shared nav on all 7 pages that carry it (`key.html`, `details_table.html`,
`counts_table.html` has no nav at all - pre-existing, unrelated - `counts_simple.html`,
`network_viz.html`, `chord_viz.html`, `matrix_viz.html`, `insights.html`).

**Source**: `data/MitInternationalCollabsLong.csv` - 3,907,374 rows, 1.69GB, genuinely
longitudinal (2018-2025, unlike AAD2024's single database-year snapshot). Every row is an MIT
scholar x external-institution collaboration (verified: `CollabInstId` is never MIT's own id -
no internal MIT-MIT rows in this file, so there is no Within/Across/Inter axis the way the
AAD2024 Details page has one). No collaborator PERSON either - the collaborator "identity" is
an INSTITUTION (name, country, industry classification via NAICS), not a person.

**Data facts learned while profiling** (see full breakdown in prior conversation; kept here for
anyone extending this page):
- 129 distinct countries; 1,253 distinct MIT persons; 97 distinct MIT units; 5,028 distinct
  collaborator institutions worldwide.
- 3 MIT unit types in this file: Department, Program, **OAU** ("Other Academic Unit" - MIT's
  labs/centers/institutes, e.g. CSAIL = "Computer Sciences and Artificial Intelligence
  Laboratory", Media Lab, Koch Institute, Research Laboratory of Electronics). No Medical
  bucket here (unlike AAD2024's Department/Program/Medical/Clinical).
- ~29% of collaborator institutions are non-academic (companies, hospitals, government) per
  NAICS classification (`NAICS_Name`); 71.2% are "Colleges, Universities, and Professional
  Schools". Exposed as a derived **Partner Type** (Academic/Non-Academic) filter, plus the raw
  NAICS category as an optional "Industry" column - user chose to add a filter rather than
  hide or exclude non-academic partners by default.
- No Discipline / Broad Field columns at all in this extract - dropped entirely (absent from
  source, not a design choice).
- Grain is the same "keep ALL affiliations" duplication as `details_base.csv`: a single
  (PersonId, DOI, CollabInstId) triple repeats once per MIT-side affiliation (avg ~2.6x, max
  11x in a sample). Only the MIT-scholar side needs a Concat control (College /
  Department(s) / Program(s) / OAU(s)) - the collaborator side is a single institution/
  country/industry tuple per row, nothing to concatenate there.
- Extremely concentrated: MIT Physics Department (UnitId 8950, 971,714 raw rows), Physics
  Program (1925, 971,714 rows) and the Laboratory for Nuclear Science OAU (160347, 801,824
  rows) together account for ~70% of the entire 3.9M-row dataset - almost certainly large
  particle-physics collaborations (CMS/ATLAS-style papers with hundreds of contributing
  institutions each, each institution becoming its own row).
- 16,738 rows (~0.4%) have blank Country / missing geocoding - unresolved collaborator
  institutions, not a "domestic US" bucket (US rows have `Country="UNITED STATES"` filled in
  normally, confirmed no overlap between blank-Country rows and CountryId=1 rows).

**Pipeline** (`data/build_intl_scan.py` then `data/build_intl_merge2.py` - do NOT use
`data/build_intl_table.py`, an earlier abandoned attempt kept only for its docstring history):
1. `build_intl_scan.py` was an earlier attempt at a checkpoint/resume CSV scan (same pattern
   as `sas/build_details_table.py`) that turned out to be unreliable on this environment's
   filesystem - full-state pickling grew slower every call (fine up to ~1M rows, unusable by
   ~2.3M), and a later delimiter-based rewrite suffered a still-not-fully-understood resume bug
   that silently duplicated large ranges of rows (confirmed via `sort | uniq -c`: some lines
   appeared up to 8x) while simultaneously losing others (full de-dup only recovered ~1.5M of
   the true 3.9M rows) - do not resume trust this script's checkpoint state or its `intl/raw2/`
   output if ever revisited.
2. **What actually worked**: `pyarrow.csv.read_csv` reads the ENTIRE 3.9M-row/1.69GB CSV in
   ~11-13s (vs pandas' ~39s and a plain `csv.reader` loop that was far too slow to finish this
   environment's per-call time budget across dozens of resumed calls). Written once to
   `data/intl_full.parquet` (94.7MB, columnar/compressed) - reads back in ~4s. This sidesteps
   the whole checkpoint-reliability problem: one reliable snapshot, no resume needed.
3. `data/build_intl_merge2.py` loads `intl_full.parquet`, groups by `UnitId` (and separately by
   non-blank `CollegeName`) with pandas, and builds each anchor's compact interned JSON payload
   (same shape as `build_details_table.py`'s `AnchorBucket`) using **vectorized** pandas/numpy
   operations (`pd.factorize` for string interning, `groupby`+argsort for the per-DOI row
   grouping) rather than a Python-level per-row loop - the 3 giant Physics-related anchors
   (~1M rows each) do NOT finish inside one call's time budget via a plain per-row loop, but
   take only a few seconds each vectorized. Resumable exactly like `build_details_table.py`
   (skip-if-already-valid per anchor file, atomic writes) - was run across 3 calls, biggest
   anchors first.
4. Output: `data/intl/anchors.json` + 104 anchor files (97 units + 7 colleges), 2.5GB total -
   noticeably larger than the AAD2024 details data (469MB) because of the 3 giant Physics
   anchors. Largest single file: `CScience__School_of.json` at 40MB (Science school includes
   Physics). Verified: `U8950.json` (Physics, Department of) has exactly 971,714 entries
   across 3,183 distinct works, matching the source row count exactly.

**Environment quirks hit while building this** (new, beyond the already-documented ones in
`qa/README.md`):
- This filesystem sometimes refuses `rm`/unlink with "Operation not permitted" on files that
  have no open file handles and normal ownership/permissions (`fuser`/`lsof` show nothing) -
  cause unconfirmed (possibly a 9p/virtiofs quirk on this host-mounted folder). Workaround:
  never rely on being able to delete a file mid-session; use a fresh filename instead.
- Backgrounded/disowned processes (`nohup ... & disown`) do NOT survive past the end of the
  bash tool call that started them - confirmed by checking `ps aux` in a follow-up call and
  finding the process gone. Long-running work MUST be split into many bounded, resumable calls
  (or made to fit in one call), not backgrounded.
- The already-known "app-tool edits invisible to shell" truncation bug also hit a **freshly
  created** file this session (`build_intl_merge.py`, written via a plain bash heredoc, not
  even the app-side Edit/Write tools) - the shell-visible copy was truncated mid-line while the
  app-side `Read` tool showed complete, correct content. Recovery: write a **fresh-named**
  copy (`build_intl_merge2.py`) via the app-side `Write` tool, verify via bash
  `python3 -c "import ast; ast.parse(...)"` immediately after. This confirms the truncation bug
  is not exclusively an OneDrive-sync-race issue as `qa/README.md` currently documents - it can
  happen on `C:\dev\collab-mit` too, for any file, from either write path.
- Foreground commands that run all the way to the ~44-45s tool-call cap sometimes get killed
  before their own graceful-shutdown code (checkpoint save, buffered file flush) can run, even
  when the script's own internal time budget left a comfortable margin - losing an entire
  call's work with no error surfaced (state file simply unchanged). Mitigation adopted: always
  wrap long-running commands in an explicit `timeout <n>` a few seconds under the tool's own
  cap, and design any resumable script to flush/checkpoint incrementally (e.g. every 50k rows)
  rather than only once at the end, so a mid-call kill loses at most one flush interval.

**Deliberately NOT done yet**:
- This page currently lives in `C:\dev\collab-mit` ONLY - the 2.5GB `data/intl/` output was
  not copied to the OneDrive `collab-mit` or `MITCollabs` mirrors given the size; ask the user
  before doing that sync (OneDrive sync race is already a known issue at much smaller sizes).
- No cross-link to `network_viz.html` (unlike Details -> Network) - the two pages' person-ID
  spaces and data models were not verified to align, and this dataset has no within/across/
  inter concept for the ego-network ring layout to key off of.
- Part 2 of the user's request (a network graph with nodes on a global map, using the real
  `Collab_Latitude`/`Collab_Longitude` fields already in this CSV) has NOT been started - this
  page was built and is pending user review first, per the user's own stated sequencing.

---

## 2026-07-08 — Details column fixes + network_viz.html ego-focus/drag/filter rework

**Details page (`details_table.html`)**: two user-reported issues fixed.
1. Faculty-side "Department" column renamed to "Department(s)" (was inconsistent with
   "Program(s)"); filter label "Select Department(s)" renamed to "Select Unit(s)" since its
   option list already changes with Unit Type mode. `DECISIONS.md` updated to match.
2. External ("inter") collaborators' units were being forced into Collab Department(s)
   regardless of their actual UnitType — `decodeInto()`'s `cDept`/`cProg`/`cMedC` now key
   purely on the collaborator's own UnitType code (`e[9]`), exactly like the Faculty side.
   Root cause of a user-reported artifact: Michigan State's Economics unit is recorded in AA
   as BOTH a Program-type "Economics" and a Department-type "Economics, Department of" (same
   parallel-encoding pattern MIT itself has), and forcing both into one column produced
   `"Economics; Economics, Department of"` in a single cell. Now splits correctly across
   Collab Department(s)/Program(s). **This changes real numbers** — anything already pulled
   from a CSV export or screenshot under the old behavior should be treated as stale.
   `DECISIONS.md` and `key.html` updated. Hit the known app/shell truncation quirk again mid-edit
   (see "environment quirks" below) — fixed via full Write+cp, not further Edit calls.

**network_viz.html — major interaction rework** (per user request after a presentation went
well with this page): backed up the pre-change version as `network_viz_backup_2026-07-08.html`
(all 3 copies, byte-identical, 30,318,952 bytes) in case of regression — this file is NOT in
the nav, it's a plain snapshot.

Changes to the live `network_viz.html` (person level only; global/unit levels unaffected):
- **Click-to-focus / ego view**: clicking any node (or arriving via a Details-page name link)
  now shows ONLY that person and their direct collaborators — every other node is removed,
  not just highlighted. A "Show Full Network" button appears (info bar) to return to the full
  anchored graph. Re-clicking a different node while already focused re-centers on the new
  person (drill-through works indefinitely).
- **Concentric rings by relationship**: in the ego view, the focal person sits at dead center;
  within-unit collaborators sit on the innermost ring, across-units on the next ring out,
  inter-institutional on the outermost ring — evenly spaced by angle, fully static (no physics
  jitter) for a clean, presentation-ready layout.
- **Colored zone bands**: translucent colored circles behind each ring (green=within,
  gold=across, purple=inter — the same colors already used site-wide for these three
  relationships) per the user's reference image of overlapping community-detection blobs;
  adapted to this page's clean ring geometry as concentric bands rather than organic hulls.
- **Draggable nodes**: click-and-drag any node to reposition it; it "pins" in place (ignored
  by the force simulation's position update in the full view; stays put in the static ego
  view) until the graph is next rebuilt.
- **Collaboration Type(s) filter**: new checkboxes (Article/Book/Book Chapter/Conference
  Proceeding/Federal Grant/Patent/Clinical Trial) matching Details page's set. Verified exact
  against the data — the embedded `edges_cap['all']` edges carry a real per-type breakdown
  (`e[4..10]`), not an approximation. **Only works when "Cap authors/work" = no limit** — the
  capped edge variants (20/50/100) don't carry the type breakdown, so the checkboxes
  auto-disable with a note when a numeric cap is set, rather than silently applying a wrong
  filter.
- **"Rank Top N by" selector**: Most collaborations (existing default) / Most interdepartmental
  (across-units only) / Most inter-institutional — changes which scholars count as the anchor's
  "top N" before their partners get added (partners are never capped). Backed by real per-rel
  edge weights, exact.
- **Deliberately NOT added**: a Year filter (checked `edge_wids` completeness first — it's
  capped at 8 works per pair for storage, so filtering by year off it would silently
  undercount exactly the busiest/most important pairs) and a "Most interdisciplinary" rank
  option (this page's embedded `D.people` has no discipline field at all — would need a
  `collab.py`/`build_network_viz.py` rebuild to add it). Both skipped for correctness rather
  than shipping a plausible-looking but wrong number.

Verified via a real jsdom run against the live 30MB file (canvas stubbed, everything else
real): initial load (550 nodes/627 links) → click-focus (143/142, correct ring radii) → drag
→ uncheck a type → Show Full Network (531/602) → change Rank-by → re-focus a different node
(22/21) → set Cap=20 (type checkboxes correctly disabled) — zero JS errors through the whole
sequence. Deployed byte-identical (md5 `f0a9c3c0...`, 30,326,155 bytes) to `dev--collab-mit`,
OneDrive `collab-mit`, and `MITCollabs`.

## 2026-07-07 — Counts (Simple) replicated in SAS from details_base.csv; resolves open item #1

Per user request ("I wanna see the counts simple table replicated in my SAS"), wrote
`sas/counts_simple_sas_check.sas`: reimplements `build_counts_simple3.py`'s exact within/across/
inter/intra/all works+collaborations formulas (per department/college/institution, per Unit Type),
but sourced from **`details_base.csv`** (the newer SAS "source of truth") instead of the older
`collabs.csv`/MITCollabs prototype pipeline that `counts_simple.html` itself was actually built
from. User chose details_base.csv over collabs.csv specifically to settle the long-open
"authoritative work universe" question (item below) in favor of the SAS pipeline.

**Validated before handing off** (I can't run SAS myself, so validated the exact same logic in
Python against the real 1.6GB `details_base.csv` first, to avoid a dead-on-arrival script):
Physics (8950) within_works=948 (matches oracle exactly), across_works distinct=192 (matches
oracle exactly), AND — unexpectedly well — within_collabs=5,561 and across_collabs=379 matched
the live `counts_simple.html` page's numbers **exactly**, even though it's sourced from a
different pipeline. Total distinct MIT-touched works = 16,747.

**This resolves open item "pick the authoritative work universe (16,738 vs 16,747)": go with
16,747 (the SAS extract).** The two pipelines turn out to agree almost perfectly at the
per-unit metric level (identical Physics collaboration counts) — the only real difference is
total work-universe SIZE (16,747 vs 16,738, concentrated in HST/IMES per the 2026-07-04 QA
note), not a methodology disagreement. Recommend closing out item #1 in "Top open items" below
(rebuild counts_simple embedded data from the SAS pipeline) using this same script's logic as
the template, since it's now proven correct against both the portal oracle and the live page.

Script details: reconstructs each work's full MIT roster from the FOCAL-side rows alone (every
MIT co-author appears as "focal" in at least one row for a work, since `details_base.csv` is
NOT anchor-restricted — this is the same property that already makes `details_table.html`'s
`computeWorkPersonCounts()` correct), counts external collaborators via `Collab_Dir='External'`
rows, then applies the same `C(m,2)` / `m*(mit_total-m)` / `m*n_ext` combinatorial formulas as
the Python build script. Institution level: "across" is hardcoded 0 (no unit above the whole
institution to be "across" from — expected, matches the existing counts_simple.html card
behavior). Follows the project's established SAS conventions from `details_unit_tests.sas`
(`%let` path macros, `guessingrows=3000000` to avoid the UnitType-informat-truncation bug
documented there, `cats()` for mixed-type ID columns, `proc printto` log redirection, a
Physics + MIT-institution spot-check printed at the end). Output: `counts_simple_sas.csv`
(one row per unit_kind × level × id) plus the printed spot-check in the log.

Deployed to `sas/` in both `dev--collab-mit` and OneDrive `collab-mit` (not yet run — the user
needs to run it in their own SAS environment per the file's header instructions, then report
back the log/spot-check).

## 2026-07-07 — "Ask the data" natural-language widget (site-wide)

Added a floating chat widget (bottom-right, all 8 pages) so users can ask plain-language
questions ("how many within-unit works does Physics have", "EECS's top partners") and get an
answer grounded in the site's own validated numbers. Three new pieces — see `AGENT_SETUP.md` for
the full setup runbook (requires the user's own Cloudflare + Anthropic accounts; I can't create
accounts or hold API keys, so deployment is a one-time manual step for them):
- `data/agent/summary.json` (53 KB) — per department/college/institution, within/across/inter/
  intra/all as both distinct-works and total-collaboration-instances, each unit's top partners
  (from `matrix()`), and a glossary explaining definitions/caveats so the model doesn't guess.
  Built by `build_agent_summary.py` (MITCollabs) from the same `collab.py` this whole project
  uses — rerun it and re-copy the JSON whenever the underlying numbers change; no redeploy needed
  since the Worker fetches it live from GitHub Pages (5-min cache).
- `worker/index.js` + `worker/wrangler.toml` — Cloudflare Worker proxy holding the Anthropic key
  server-side (never in client JS), feeds `summary.json` to Claude as grounding context, answers
  only from that data. Model defaults to `claude-haiku-4-5` for cost; CORS locked to the Pages
  origin.
- `agent_widget.js` — self-injecting floating chat button/panel; one `<script>` tag added near
  `</body>` on all 8 pages. `AGENT_ENDPOINT` at the top must be set to the deployed Worker URL
  before it does anything. Until then it runs a client-side-only DEMO MODE (keyword-matches
  `data/agent/summary.json` directly in the browser, no AI/key/network call) so the user can
  preview the widget locally via `serve.bat` before deploying the real Worker.

**Found and fixed in passing**: while inserting the widget tag, discovered the shell-mounted
`C:\dev\collab-mit` copies of `key.html` and `insights.html` were fully truncated (no closing
tags — a worse case of the same app/shell divergence noted below for `details_table.html`), and
`network_viz.html`/`chord_viz.html` had trailing NUL padding. The **live GitHub repo/Pages site
was unaffected** (confirmed clean via a fresh clone) — this was purely a stale local sandbox-mount
artifact. Rebuilt all 8 pages from the clean GitHub copies (not the local mount) before inserting
the widget tag, so this also silently fixed the local corruption. All 8 pages verified byte-
identical across `dev--collab-mit`, OneDrive `collab-mit`, and `MITCollabs`, each ending in
`</html>` with zero trailing NULs.

**Also happened again while writing this very file, AND while writing `agent_widget.js`**: the
Edit tool's shell-visible result, and even a couple of fresh Write-tool calls, were found
truncated immediately after the operation reported success (same divergence pattern, now also
seen on plain Write calls to the outputs folder, not just Edit calls on the collab-mit copies).
Fixed each time by re-writing from verified-complete content and byte-checking the result before
moving on. This is now a recurring failure mode across many files this session — treat "the tool
said it succeeded" as insufficient proof for any file, especially ones touched multiple times or
containing a lot of text; always byte-check the tail (and ideally run `node --check` for JS)
before considering a write final.

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
remaining prototype-fed embedded data — **RESOLVED 2026-07-07: go with 16,747 (SAS), see above**;
(3) get the project out of OneDrive (three sync-race incidents confirmed — one truncated 4
files, one served a user-visible blank page) — **DONE, moved to `C:\dev\collab-mit`**;
(4) insights betweenness unverified; (5) human browser pass (no headless browser available) —
**DONE**.

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

**2026-07-08 addendum #2 (real basemap):** replaced the disabled hand-drawn continents with a
real one. User downloaded two Natural Earth GeoJSON files via their own browser (my own
web_fetch could reach the source but couldn't reliably extract the resulting multi-hundred-KB
single-line JSON back out of its tool-result file, and direct sandbox network access to
raw.githubusercontent.com/cdn.jsdelivr.net is blocked by an outbound proxy) and dropped them in
`C:\dev\collab-mit`: `ne_50m_admin_0_countries.geojson.txt` (242 countries, 3MB) and
`ne_110m_admin_1_states_provinces.geojson.txt` (US states + DC only, 51 features, 184KB). Built
`data/basemap_countries.json` and `data/basemap_states.json` via a one-off script: exterior
rings only (interior holes dropped, negligible at this zoom), distance-based point decimation,
coordinates rounded to 2-3 decimals -> 1,620 country rings (~820KB) and 51 state polygons
(~40KB). Both embedded inline in `intl_map.html` as a new `basemapData` JSON script block;
`drawBasemap()` (replacing the disabled `drawContinents()`) fills/strokes the country rings and
strokes the state borders under the institution nodes. Also re-derived the State field using
real point-in-polygon against the state boundaries (1,843 of 1,866 US institutions matched a
polygon directly; the remaining 23 - coastal/edge points - fall back to nearest-state-center
classification, same as before, so coverage is still all 1,866; each institution now carries
`stateMethod: "polygon"|"centroid_fallback"`). File is now ~2.4MB (was ~1.5MB) - still a single
self-contained HTML file, no server-side change needed. Verified via jsdom: basemap renders
(canvas fill/stroke calls fire), state filter still correct (California -> 151, all match),
country/All-but-US/clear/zoom/pan/reset all still work, spot-checked Stanford-area and Harvard
group -> California / Massachusetts correctly via the new polygon method.

**2026-07-08 addendum #3 (geocode QA, user-reported):** user spotted "Agora" (UK, Non-Academic)
plotted on the US west coast in the map's tooltip. Root cause: `Agora`'s exact geocode
(Collab_Latitude/Longitude) in the source CSV was simply wrong for that institution
(lat=37.393, lon=-121.965 - Santa Clara County, CA), despite `Country=UNITED KINGDOM`. Built a
real point-in-country-polygon QA check (using the full-precision `ne_50m_admin_0_countries`
data, matched against the dataset's 128 country strings via a hand-built alias table keyed on
Natural Earth's ADMIN/SOVEREIGNT fields - handles territories like Guam/Hong Kong correctly by
falling back to sovereignty-wide matching) against all 4,865 mapped institutions with an exact
geocode. Used a 1.5-degree bbox buffer (generous enough to avoid flagging real edge/coastal/
small-territory cases like University of Macau, which is genuinely ~0.05 deg outside Macao's
simplified polygon) - result was stable at exactly 2 flagged institutions across buffer widths
from 0.2 to 1.5 degrees: **Agora** (UK, was in California) and **Bosch** (Germany, was in
Chicago - lat=41.857, lon=-87.856, presumably geocoded to a US office instead of headquarters).
Both corrected to their country-midpoint coordinate (`coordExact:false`, new `geocodeFlag:true`
field so the tooltip says so explicitly: "source geocode was wrong - positioned at country
midpoint instead"). This was a data-quality issue in the upstream CSV, not something introduced
by this page's own pipeline - the QA check is available to reuse if intl_details_table.html or
anything else built from `MitInternationalCollabsLong.csv` needs the same sanity pass.

**2026-07-09: network_viz.html node labels + tooltips (user-reported).** User feedback:
clicking an individual on the network graph left most nodes unlabeled, and tooltips felt thin.
JS-only fix (no data rebuild - `D.people[pid]` only ever carried `[name, rank]`, so anything
needing department/institution per collaborator would require a packer change; not attempted
here). Changes in `network_viz.html` (backed up to `network_viz_backup_2026-07-09.html` first):
- Person-level label visibility: ego view (`egoActive`) now always labels every node - the whole
  point of clicking into someone's ego network is seeing who's in it, so hiding low-degree nodes
  there was actively counterproductive. General (non-ego) anchor browsing loosened from
  "≤40 nodes or zoom>1.5" + top-25%-by-degree to "≤70 nodes or zoom>1.3" + top-12%-by-degree -
  still declutters very large departments but labels noticeably more.
- Label text: `shortName()` now renders "Last, F." instead of bare surname (disambiguates
  same-surname collaborators without much more clutter).
- Tooltip (person level) now adds: a per-work-type breakdown line (Articles/Books/Book
  Ch./Conference/Grants/Patents/Clinical - same counts as the click-through detail panel, summed
  across the hovered node's links) and an explicit "Click to focus their network & see full
  details ->" line, since clicking always re-centers the ego view on whoever you clicked and
  that wasn't obvious from hovering alone.
- Refactor: `pairEdgeCache` is now built once per `buildGraph()` call (was previously rebuilt
  redundantly inside `showDetailPanel()` on every click) and shared by both the tooltip and the
  detail panel, so the new tooltip breakdown is basically free.
- Verified: `node --check` on the extracted script (syntax), plus a lightweight logic-only test
  against the real embedded JSON (bypassing jsdom - a full jsdom render of this 30MB page timed
  out at the sandbox's 45s cap, likely jsdom's HTML tokenizer struggling with one giant inline
  script text node, not a real bug) confirming `shortName()`, `rebuildPairEdgeCache()`, and the
  per-type-sum arithmetic all behave correctly against live data.

**2026-07-09 (2): network_viz.html dept/institution + detail panel table + ego ring clarity.**
Follow-up to the labels/tooltips pass above, from further user feedback with screenshots:
- Added department (internal MIT people) / institution (external collaborators) to every
  person node, not just the currently-browsed anchor. Source: `db['pinfo'][pid]['inst']`
  (institution, already loaded by `collab.load()` for every person including external) and
  `db['units'][pid]` + `db['uname']` (department names) - no new source data needed, just
  wasn't being read into the network page's payload before. Ran a one-off enrichment
  (equivalent logic could be folded into `build_network_viz.py`'s `pack()` later) that changes
  `D.people[pid]` from `[name, rank]` to `[name, rank, extra]` and re-spliced it into the
  existing (already hand-patched-many-times) `network_viz.html` rather than regenerating from
  `../MITCollabs/build_network_viz.py`'s template, which would have clobbered every incremental
  JS fix already made this session and in prior sessions (ego view, cross-link pid arrival,
  today's label/tooltip work, etc.) - that template has drifted from the deployed HTML and
  should be reconciled at some point, but not attempted here.
  - Dedup fix: `db['units'][pid]` returns BOTH Department-type and Program-type unit rows, and
    ~98% of MIT faculty are enrolled in a same-named Department+Program pair (documented in
    ../MITCollabs/CLAUDE.md) - naively joining all unit names produced ugly duplicates like
    "Physics; Physics, Department of". Fixed by normalizing away the ", Department of"/", Program"
    suffix before dedup, preferring the Department-styled label when both exist for the same
    underlying unit. Genuinely distinct multi-affiliations (e.g. "Biological Engineering,
    Department of; Microbiology") still both show, capped at 2 + "(+N more)".
  - Also suppressed a redundant second mention when the hovered/clicked node's own department
    happens to equal the currently-browsed anchor unit (previously showed "Physics, Department
    of · (Physics, Department of)").
  - Wired the new field into node construction (`extra:p[2]`), the person-mode hover tooltip,
    and the click-through detail panel header.
- Detail-panel collaborator table was visually mangled (headers overlapping, names cramped/
  wrapping badly) at its old fixed 640px width across 10 columns. Widened panel to 860px
  (max-width:calc(100% - 20px) so it still fits smaller windows), gave the table an explicit
  `<colgroup>` (name 230px, rel 56px, 7 type columns at 46px each, total 56px), and wrapped the
  table in a `.det-tbl-wrap{overflow-x:auto}` div as a safety net for any still-tighter window.
  Same colgroup/wrap treatment applied to the simpler 2-column partner table used at
  department/school (non-person) levels for consistency.
- Ego-view ring "zones" (green=within/gold=across/purple=inter) were fill-only with no drawn
  boundary, making it hard to visually confirm which ring a given node actually landed in -
  user flagged an external (inter/purple) node that looked like it hadn't reached the outer
  ring. Investigated the ring-assignment code itself (`applyEgoFilter`'s `byRel` bucketing by
  the edge's already-computed `rel`, which correctly forces `rel=2` whenever either side of an
  edge is rank-4/External regardless of anchor membership) and found no placement bug - the
  confusion was the soft overlapping fills with no boundary line. Added a dashed stroke at each
  populated ring's true radius so ring membership is now visually unambiguous either way.
- Verified via `node --check` on the extracted script plus a full jsdom functional test against
  a trimmed real-data copy (Physics anchor, ~2,278 people/nodes - the full 30MB embedded payload
  makes jsdom's HTML parser too slow for the sandbox's 45s tool-call cap, so testing uses a
  same-anchor subset of the *real* embedded JSON, not synthetic data): confirmed `extra` is
  populated for both internal and external sample nodes, clicking any node (including a
  non-center node inside an already-active ego view) correctly re-centers the ego view on that
  person, the detail panel renders with the new colgroup/wrap markup, tooltip shows the new
  dept/institution line without the anchor-label duplicate, and `draw()` (including the new ego
  ring strokes) runs with zero console errors.
