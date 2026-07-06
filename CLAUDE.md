# collab-mit — MIT Collaboration Network (v2)

## Start of each session — reading order (do this first)
1. This file.
2. `HANDOFF.md` — current state, top section first (2026-07-04 overnight QA run).
3. `DECISIONS.md` — user-mandated conventions. Treat as requirements; do not undo.
4. `qa/README.md` — test harnesses, validation verdicts, and CRITICAL environment quirks
   (OneDrive sync race; app-tool edits invisible to the shell; 45s shell call cap).
5. Check memory (auto-loaded); ask the user what they want to work on.

## What this is
The MIT Collaboration Network analytics tool for Academic Analytics, v2.
v1 lives at `C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\mitcollabs`
(not mounted by default) and at https://academic-analytics-llc.github.io/mit-collabs/.

## Key facts
- Institution: MIT (institutionid 123 — context only; never print it in UI text)
- Project code: AAD2024-2904 (called exactly that — no "project" prefix)
- ~1,270 MIT scholars; 16,738 works (prototype extract) / 16,747 (SAS extract — variance open)
- Oracle (Physics dept): within = 948; across = 231 (partner-summed) / 192 (distinct works)
- Unit types: Department, Program, Medical — the word "Clinical" is banned from authored UI

## Pipeline
```
SAS extract (sas/details_extract_AAD2024_MIT.sas → details_base.csv, 1.6GB)
  → sas/build_details_table.py → data/details/*.json (82 anchors)
  → details_table.html fetches at runtime (serve over http: serve.bat)
```
counts_table / counts_simple / network_viz / chord_viz / insights carry EMBEDDED data from
the older prototype pipeline (`../MITCollabs/collab.py`); matrix cells + chord global were
REBUILT from the SAS files on 2026-07-03. See HANDOFF.md for exactly what is validated.

## Pages (all live, all in the shared nav, Key first)
key.html · details_table.html · counts_table.html · counts_simple.html · network_viz.html ·
chord_viz.html · matrix_viz.html · insights.html
QA reports: QA_Review_2026-07-03.docx, QA_Overnight_2026-07-04.docx

## Working rules for this folder
- OneDrive sync race is real: after any large write, verify the file ends with `</html>`
  from both the app side and the shell side. Prefer shell-side writes for big files.
- App-tool (Edit/Write) changes to a file never re-sync to the shell mount in-session:
  to test such a file, write a fresh-named copy (see qa/details_testcopy.html).
- No git (OneDrive blocks it from the sandbox). A dead `.git/` + `.gitignore` can be
  deleted manually. Recommend the user set up git from a real terminal or move the folder.
- Design: AcA Blue #254467 headers, Open Sans + Crimson Text, shared .aa-nav on every page.

## GitHub
- Org: Academic-Analytics-LLC · gh CLI authenticated as nshahAA (on the user's machine)
- v1 repo: https://github.com/Academic-Analytics-LLC/mit-collabs
