# Product decisions log — user-mandated, do not undo

Every item below was an explicit instruction or approved decision from Nil (the user).
A future session should treat these as requirements, not suggestions.

## Naming & format (matched to the team's peer-review-passed Tableau report)
- Column vocabulary on Details: Faculty Name · Department(s) · Program(s) · Medical · Discipline ·
  Broad Field · College/School · Works · Collaboration Type · Year · Collab ID · Collab Detail ·
  Collab Title · Collab Institution · Collab Faculty Name · Collab Department(s) · Collab
  Program(s) · Collab Medical · Collab Discipline. "Collab" prefix, no period, spelled out.
  (2026-07-08: Faculty-side Department relabeled Department(s) for consistency with Program(s);
  was previously just "Department".)
- Filter titles use the "Select …" prefix: Select College/School, Select Unit(s),
  Select Discipline(s), Select Collab Discipline(s), Select Year(s), Select Collaboration Type(s).
  (2026-07-08: the department-picker filter was renamed Select Unit(s), since its option list
  already changes with Unit Type mode — Programs in Program mode, Medical units in Medical mode —
  so "Select Department(s)" was inaccurate outside Department mode.)
- "College/School" (this exact form) everywhere; plurals with "(s)": Department(s),
  Discipline(s), Broad Field(s).
- Level pickers ordered BIG → SMALL everywhere: College / School → Department → (Anchor) → Person.
- Buttons: "Clear Filters" and "Download Data (CSV)".
- Titles: "MIT Collaboration Details AAD2024". It's just "AAD2024-2904" — never
  "project AAD2024-2904", never "(institutionid 123)" in user-visible text.

## International Collaborations page (`intl_details_table.html`) — separate product, own conventions
This page uses a DIFFERENT dataset (`data/MitInternationalCollabsLong.csv`) from the rest of
the site (which is all AAD2024-2904). Its conventions below do NOT apply to the AAD2024 pages
and vice versa — the "Unit types" rule right below this section (Department/Program/Medical,
no "Clinical" in UI text) is specific to AAD2024 pages only.
- Three unit types on this page: Department, Program, **OAU** (spelled out as "Other Academic
  Unit" in a tooltip — MIT's labs/centers/institutes, e.g. CSAIL, Media Lab, Koch Institute).
  No Medical bucket exists in this source data. (2026-07-08: user chose "add as 3rd toggle
  option" over folding OAU rows into the Department view.)
- Partner Type filter (Academic / Non-Academic, derived from NAICS_Name) is a REAL filter, not
  just a display label — user explicitly chose this over "include with no filter" or "exclude
  non-academic by default", since ~29% of collaborator institutions here are companies,
  hospitals, or government agencies rather than universities. The raw NAICS category is also
  exposed as an optional "Industry" column for detail beyond the Academic/Non-Academic split.
- Year IS a real, meaningful filter here (this dataset spans 2018–2025) — this is the OPPOSITE
  of the AAD2024 pages' "do not slice by year" rule (see `MITCollabs/CLAUDE.md`), which applies
  only to the single-database-year AAD2024 snapshot, not to this genuinely longitudinal file.
- No Within/Across/Inter scope filter on this page — every row here is MIT-scholar x
  external-institution by construction (verified `CollabInstId` is never MIT's own id), so
  there is no internal/external axis to filter on the way AAD2024's Details page has one.

## Unit types
- There are exactly three unit types in this product: Department, Program, Medical.
  The word "Clinical" must not appear in any authored UI text, loading message, hint, label,
  or comment. (The "Clinical Trial" COLLABORATION TYPE and the disciplines "Clinical
  Pathology"/"Clinical Psychology" are data values and stay.)
- Unit affiliations render as SPLIT columns by type — never mixed in one cell, never
  suffix-annotated. Visibility = Unit Type mode gate AND per-column Show toggle:
  Department column in Department/All modes; Program(s) in Program/All; Medical in Medical/All.
  Both Faculty and Collab sides; same rule for the one-row-per-work sub-lines; CSV mirrors.
- External collaborators' units (their home institution's) split by unit type into
  Department(s)/Program(s)/Medical exactly like the Faculty side — their own institution's
  Department/Program/Medical code decides the column, same rule as MIT collaborators.
  (2026-07-08: previously all external units were forced into Department(s) regardless of
  type; changed since Collab Program(s) already exists as its own column, and forcing
  Program-type external units into Department(s) produced misleading duplicate-looking
  entries, e.g. Michigan State's Economics unit appearing as both "Economics" (Program) and
  "Economics, Department of" (Department) joined together in one Department(s) cell.)

## Details page behavior
- One row per work view (toggle label: "One row per work"): filters choose WHICH works
  qualify; each work then shows its COMPLETE roster (internal works list all MIT collaborators
  regardless of Scope). People deduped, MIT scholars first, split MIT vs External columns,
  first 10 + expandable "+ N more", per-person unit sub-line + labeled hover tooltip
  (Department(s) / Program(s) / Medical / Discipline(s) / College / School / Institution).
- Relationship pills in unique view appear ONLY when a Unit filter is selected, and are
  computed relative to the SELECTED unit (any-overlap-wins).
- Year filter is a multi-select listing ONLY years present in the data (newest first).
- Names link to network_viz.html?pid=&anchor=&scope= (scope always passed).

## Network page
- Default scope: All. Deep-linked person is force-included past the Top N cap and gets
  selected with panel open. Legend is level-aware (rank vs school colors).

## Counting conventions (validated, keep)
- Counts (Partners) + chord anchored: portal partner-summed convention, partner units of the
  anchor's own unit kind (Physics across = 231 oracle). (2026-07-10: `counts_table.html`
  removed sitewide per below; chord anchored mode still uses this convention - see note below,
  a ribbon chart is structurally pairwise so this isn't the same kind of "fix" as matrix/chord
  global's rebuild was. User decided to leave chord anchored as-is for now.)
- Details / Counts / Matrix / chord global: distinct works (Physics across = 192).
- MIN(rel) any-overlap-wins collapse everywhere; grain warning: never sum Details rows.
- Matrix + chord global data are SAS-rebuilt (2026-07-03) — cross-unit numbers intentionally
  changed from the prototype (e.g. Physics×EAPS 289→81).
- (2026-07-10) `counts_table.html` retired sitewide (nav removed everywhere, file deleted from
  dev + MITCollabs copies; the OneDrive `collab-mit` copy's file still needs manual deletion -
  see HANDOFF.md). `counts_simple.html` migrated off the prototype pipeline onto SAS
  (`details_base.csv`) - work universe now 16,747 (was 16,738), resolving the "rebuild from SAS
  or document convention" open item below. Interim data was computed via a Python
  re-implementation of the formulas (no SAS engine available in the build sandbox);
  `sas/build_counts_simple_export.sas` now exists so the user can run the real SAS computation
  and hand back CSVs for a purely-mechanical reshape into the same JSON target - see HANDOFF.md
  for full detail and status of that hand-off.

## Key page
- key.html = sidebar-TOC documentation page (user-approved layout), first nav item on all
  8 pages, AcA blue styling, AAD 2024 time windows box (years bumped +1 from the 2023 box),
  no "Data source" callout, sentence reads "…built from the Academic Analytics comparative
  database AAD2024-2904."

## Page naming
- The page at `counts_simple.html` is called just **"Counts"** everywhere in the UI (nav,
  key.html TOC/headings/body) — the "(Simple)" disambiguator was dropped 2026-07-10 once
  `counts_table.html` ("Counts (Partners)") was retired sitewide, so there's no longer a
  second "Counts" page to disambiguate against. The filename (`counts_simple.html`) and
  internal script/JSON names (`build_counts_simple_v3.py`, `counts_simple_v3.json`, etc.)
  are unaffected — only user-facing text changed.

## Design standards
- AcA Blue #254467 (rgb 37,68,103) headers with white text; Open Sans body + Crimson Text
  headings; shared .aa-nav on every page (Key first, current page class="cur").
- (2026-07-10, requested, NOT YET IMPLEMENTED - see HANDOFF.md) Int'l Collabs / Int'l Map use a
  different dataset from the AAD2024 pages (see "International Collaborations page" section
  above) and should look visually separated in `.aa-nav`, not just another tab in the same row:
  add a thick white vertical divider between Insights and Int'l Collabs, push Int'l Collabs/Int'l
  Map to the right of that divider, and spell out "Int'l" as "International" in both link labels.

## Details page behavior (continued)
- (2026-07-10) Details page's College/Unit/Discipline/Faculty filters cascade MUTUALLY, matching
  Counts' behavior - not just the older one-directional College->Unit narrowing. Pairwise
  relationship maps (collegeToDepts/deptToColleges/discToUnits/unitToDiscs/discToColleges/
  collegeToDiscs) must be built from RAW per-row data (one scholar-affiliation per row), never
  from per-person aggregated pipe-joined fields - the latter caused a real bug on Counts
  (a person with 2+ college/unit affiliations leaked units from the WRONG college into the
  narrowed list; see HANDOFF.md "Boyden bug"). Faculty selection also narrows College/Unit/
  Discipline via `facultyAffiliations()` (the selected people's own affiliations), same principle.
