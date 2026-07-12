# collab-mit — Handoff

Cleaned up and condensed 2026-07-12. Older session-by-session blow-by-blow (truncation
recoveries, git-push troubleshooting, subdomain naming, etc.) has been summarized rather than
kept verbatim — read `qa/README.md` for the environment-quirk mechanics if you hit one of
these again, they're well understood at this point.

## START HERE (next session) — open items, in priority order

1. **Push this session's local-only changes to GitHub.** Not yet committed/pushed: the nav
   divider + "International" spelling-out across all shared-nav pages, the footer removals
   (`counts_v2.html`, `key.html`, `matrix_viz.html`, `intl_details_table.html`,
   `intl_map.html`), the `serve.bat` fix (was opening the old `details_table.html`, now opens
   `key.html`), the new `intl_trends.html` page, and this doc-cleanup pass. Last confirmed
   push landed commit `a4fbb26` on `origin/main` — everything above post-dates it.
2. **Get user confirmation on `intl_trends.html` v2** (viewport-fit no-scroll layout, grouped
   `<optgroup>` unit/college picker, animated Play/Pause line reveal) actually looks and works
   right in a real browser — built and logic-verified, never visually confirmed.
3. **Details-page filter-cascade bug** (reported, not investigated): clicking a name on
   `counts_v2.html` correctly cascades College/Unit/Discipline filters; the equivalent click
   on `details_v2.html` does not.
4. **`network_viz.html` deep-link handling** (`?pid=&anchor=&scope=`, lets a Details-page name
   link jump straight into that person's ego view) needs rebuilding — lost when the page was
   restored from a pre-features backup after being found corrupted. Code comments referencing
   `_urlPid`/`_urlAnchorKey` are still there as a guide to what existed before.
5. **Decide whether to delete superseded files from disk**: `counts_simple.html` /
   `details_table.html` (fully replaced by `_v2` versions, verified working) and the dated
   `network_viz_backup_*.html` snapshots. Needs `allow_cowork_file_delete` — ask the user first
   since this folder blocks silent deletes.
6. **`sas/build_counts_simple_export.sas`** (the real SAS script, for the user to run in their
   own environment) hasn't been updated to match `build_counts_simple_v4.py`'s schema yet
   (college/units/years/titles/details fields) — needs that before the user's next SAS run
   produces a fully matching export.

## Live pages (10, all in the shared `.aa-nav`, Key first)

- `key.html` — sidebar-TOC documentation page.
- `details_v2.html` — per-work/per-pair detail table, AAD2024-2904 data, fetches
  `data/details/*.json` at runtime.
- `counts_v2.html` — per-entity rollup (Institution → College → Unit → Person), SAS-sourced,
  embedded data.
- `network_viz.html` — force-directed graph; ego view, path-finder, compare mode, Bridge
  People view, institution/department rollups. Embedded data (prototype pipeline), ~30MB.
- `chord_viz.html` — ribbon chart, global mode SAS-rebuilt, anchored mode still
  portal-partner-summed convention (see `DECISIONS.md`).
- `matrix_viz.html` — unit×unit / college×college heatmap, SAS-rebuilt.
- `insights.html` — degree/betweenness and headline stats.
- `intl_details_table.html` — international collaborations, per-row detail (separate dataset,
  2018–2025, MIT scholar × external institution).
- `intl_map.html` — international collaborations on a world map, real Natural-Earth basemap.
- `intl_trends.html` — international collaborations, year-over-year trend lines per
  department/college, animated reveal (added 2026-07-12).

Retired/removed: `counts_table.html` ("Counts (Partners)", deleted). Superseded, not yet
deleted from disk: `counts_simple.html`, `details_table.html` (see open item #5 above).

## Data pipelines and validation — current state

Two datasets power this site:

1. **AAD2024-2904** (the main site): `sas/details_extract_AAD2024_MIT.sas` →
   `sas/details_base.csv` (1.6GB, the authoritative source) → `sas/build_details_table.py` →
   `data/details/*.json` (82 anchors), consumed at runtime by `details_v2.html`. Matrix cells,
   chord global mode, and `counts_v2.html` were rebuilt directly from this SAS source.
   `network_viz.html`, chord anchored mode, and `insights.html` still carry embedded data from
   the older prototype pipeline (`../MITCollabs/collab.py`) — validated to agree with the SAS
   pipeline at the person-pair level (see below), not yet migrated.
2. **International collaborations**: `data/MitInternationalCollabsLong.csv` (3.9M rows, 2018–
   2025, genuinely longitudinal, no within/across/inter axis) → `data/build_intl_merge2.py` →
   `data/intl/anchors.json` + per-anchor JSON files, fetched at runtime by all three `intl_*`
   pages. See `DECISIONS.md` for this dataset's own conventions (OAU unit type, Partner Type
   filter, Year as a real filter — the opposite of the AAD2024 "don't slice by year" rule).

**Validation, resolved:** the authoritative AAD2024 work universe is **16,747** (SAS extract) —
the prototype pipeline's 16,738 was missing a handful of HST/IMES conference abstracts; every
small mismatch previously seen between prototype-fed pages and the SAS oracle traced to this
now-closed gap. Oracle checks: Physics within=948, across=231 (partner-summed)/192 (distinct
works) — both match across every page that claims to reproduce them. Matrix (723/723 unit +
27/27 college cells) and chord global (27/27) are exact vs SAS. `network_viz.html`'s
person-pair edges match the SAS pipeline exactly at Physics (192 within / 136 across).

**Still open / by-design, not bugs:** chord anchored mode and `counts_table.html`'s old
partner-summed convention structurally can't produce "distinct works" the way a ribbon/pairwise
chart works — left as-is, documented in `DECISIONS.md`. Counts' college/person tabs use a
person-centric any-overlap classification where multi-affiliated people differ from an
anchor-relative recompute by design, not a bug.

## Page-by-page notes

**`details_v2.html` / `counts_v2.html`** (renamed from `details_table.html`/`counts_simple.html`
2026-07-10 to rule out browser-caching confusion): both now have a full **mutual filter
cascade** across College/Unit/Discipline/Faculty(Person) — selecting any one narrows the
option lists of all the others, both directions. Getting here required fixing a real bug (the
"Boyden bug"): College↔Unit relationship maps must be built from raw per-row data, never from
per-person pipe-joined aggregate fields, or a person with multiple college/unit affiliations
leaks units from the wrong college into the narrowed list. Both pages also share filter state
across tabs via `sessionStorage` (`aad2024_shared_filters`) for the session's duration. Counts
gained a full v4 data schema (college/units/years/titles/details fields, `counts_v2.html`'s
Select College(s)/Year(s)/Title/Detail filters) and matches Details' visual design (same CSS
variables, `.ctl`/`.seg`/`.btn` classes) with a fixed `.hdr-actions` column so Clear
Filters/Download CSV never shift position on resize. The Counts→Details header/methodology
mismatch was fixed 2026-07-11 (methodology text moved to a card below the header instead of
inside it).

**`network_viz.html`**: accumulated a large feature set on top of the base force-directed
graph — click-to-focus ego view with within/across/inter zone bands, draggable nodes,
Collaboration Type filter, Rank-Top-N-by selector, name search, shortest-path finder, 3
independent institution/department/unit rollup toggles, two-anchor compare view (deterministic
ring layout, capped at 100 partners/side for performance), a "Bridge People" view (who connects
otherwise-separate MIT departments, scored by distinct-department-reach not raw volume), and a
per-person "fingerprint" panel (donut chart, top collaborators/institutions, repeat-collaborator
rate, descriptive labels). All validated against real embedded data via jsdom/Node harnesses.
Known gap: the `?pid=&anchor=&scope=` deep-link from Details was lost in a backup restore (see
open item #4).

**International pages**: built in sequence — `intl_details_table.html` (per-row detail) →
`intl_map.html` (world map, real Natural Earth basemap after an initial hand-drawn attempt was
rightly rejected as ugly; two bad source geocodes found and corrected — Agora/UK and Bosch/
Germany were plotted in the wrong country) → `intl_trends.html` (year-over-year trend lines,
2026-07-12). All three share the same anchor-file data pipeline.

**"Ask the data" chat widget**: floating panel on every page, backed by a Cloudflare Worker
(`worker/index.js`) that holds the Anthropic API key server-side and grounds answers in
`data/agent/summary.json`. Deployed and operational as of 2026-07-11 (see `AGENT_SETUP.md` for
the runbook) — get-it-working issues along the way (workers.dev subdomain naming, a broken
1-character API key secret, CORS for the local preview origin, an initial 429 rate limit on a
fresh Anthropic account) are all resolved; nothing to redo here.

**Git / GitHub**: real git repo now works from this folder (`Academic-Analytics-LLC/mit-collabs`,
`main` branch) — the earlier repeated push failures were multi-GB untracked build/raw-data
files hitting GitHub's file-size limit, fixed via `.gitignore` additions (raw CSVs, parquet
files, superseded HTML, `__pycache__`) plus a clean `git reset --soft origin/main` + recommit.
Last confirmed-landed commit: `a4fbb26`.

## data/details/*.json schema (reference)

Unit file: `{strs:[...], people:{pid:[name,rank]}, works:{wid:[title,type,year,detail]},
rows_by_work:{wid:[[15-el row],...]}}`; row = `[pid,sCollegeIdx,sDeptIdx,sUnitTypeCode,
sDiscIdx,sBFIdx,cpid,cCollegeIdx,cDeptIdx,cUnitTypeCode,cDiscIdx,cBFIdx,cInstIdx,relCode,
dirCode]`; rel 0=within,1=across,2=across institutions. String indices are per-file. For
rel-2 rows, cDept/cCollege are the collaborator's units at THEIR OWN institution (name
collisions with MIT units are common — always filter rel<2 for MIT-side aggregation).
`anchors.json`: 82 anchors with unit_type + file.
