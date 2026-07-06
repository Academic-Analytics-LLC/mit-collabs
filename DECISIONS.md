# Product decisions log — user-mandated, do not undo

Every item below was an explicit instruction or approved decision from Nil (the user).
A future session should treat these as requirements, not suggestions.

## Naming & format (matched to the team's peer-review-passed Tableau report)
- Column vocabulary on Details: Faculty Name · Department · Program(s) · Medical · Discipline ·
  Broad Field · College/School · Works · Collaboration Type · Year · Collab ID · Collab Detail ·
  Collab Title · Collab Institution · Collab Faculty Name · Collab Department(s) · Collab
  Program(s) · Collab Medical · Collab Discipline. "Collab" prefix, no period, spelled out.
- Filter titles use the "Select …" prefix: Select College/School, Select Department(s),
  Select Discipline(s), Select Collab Discipline(s), Select Year(s), Select Collaboration Type(s).
- "College/School" (this exact form) everywhere; plurals with "(s)": Department(s),
  Discipline(s), Broad Field(s).
- Level pickers ordered BIG → SMALL everywhere: College / School → Department → (Anchor) → Person.
- Buttons: "Clear Filters" and "Download Data (CSV)".
- Titles: "MIT Collaboration Details AAD2024". It's just "AAD2024-2904" — never
  "project AAD2024-2904", never "(institutionid 123)" in user-visible text.

## Unit types
- There are exactly three unit types in this product: Department, Program, Medical.
  The word "Clinical" must not appear in any authored UI text, loading message, hint, label,
  or comment. (The "Clinical Trial" COLLABORATION TYPE and the disciplines "Clinical
  Pathology"/"Clinical Psychology" are data values and stay.)
- Unit affiliations render as SPLIT columns by type — never mixed in one cell, never
  suffix-annotated. Visibility = Unit Type mode gate AND per-column Show toggle:
  Department column in Department/All modes; Program(s) in Program/All; Medical in Medical/All.
  Both Faculty and Collab sides; same rule for the one-row-per-work sub-lines; CSV mirrors.
- External collaborators' units (their home institution's) all stay in the Department(s)
  column — MIT unit-type distinctions don't apply to them.

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
  anchor's own unit kind (Physics across = 231 oracle).
- Details / Counts (Simple) / Matrix / chord global: distinct works (Physics across = 192).
- MIN(rel) any-overlap-wins collapse everywhere; grain warning: never sum Details rows.
- Matrix + chord global data are SAS-rebuilt (2026-07-03) — cross-unit numbers intentionally
  changed from the prototype (e.g. Physics×EAPS 289→81).

## Key page
- key.html = sidebar-TOC documentation page (user-approved layout), first nav item on all
  8 pages, AcA blue styling, AAD 2024 time windows box (years bumped +1 from the 2023 box),
  no "Data source" callout, sentence reads "…built from the Academic Analytics comparative
  database AAD2024-2904."

## Design standards
- AcA Blue #254467 (rgb 37,68,103) headers with white text; Open Sans body + Crimson Text
  headings; shared .aa-nav on every page (Key first, current page class="cur").
