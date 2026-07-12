# collab-mit — MIT Collaboration Network (v2)

## Start of each session — reading order (do this first)
1. This file.
2. `HANDOFF.md` — current state. Read the "START HERE" section at the top first; only dig
   into the dated log below it if you need history on a specific past change.
3. `DECISIONS.md` — user-mandated conventions. Treat as requirements; do not undo.
4. `qa/README.md` — test harnesses, validation verdicts, and environment quirks (app-tool
   edits can go stale in the shell mount; 45s shell call cap).
5. Check memory (auto-loaded); ask the user what they want to work on.

## What this is
The MIT Collaboration Network analytics tool for Academic Analytics, v2. Lives and is
worked on exclusively at `C:\dev\collab-mit` (plain local disk, not OneDrive-synced — the
project was moved off OneDrive early on because of a sync race that corrupted files).
v1 lives at `C:\Users\nshah\OneDrive - Academic Analytics\MainProjectFiles\mitcollabs`
(not mounted by default) and at https://academic-analytics-llc.github.io/mit-collabs/.

## Key facts
- Institution: MIT (institutionid 123 — context only; never print it in UI text)
- Project code: AAD2024-2904 (called exactly that — no "project" prefix)
- ~1,270 MIT scholars; 16,747 works (SAS extract, the authoritative universe — see
  `DECISIONS.md` "Counting conventions")
- Oracle (Physics dept): within = 948; across = 231 (partner-summed) / 192 (distinct works)
- Unit types (AAD2024 pages): Department, Program, Medical — "Clinical" is banned from
  authored UI text. International pages use a different 3-way split — see below.

## Pipeline
```
SAS extract (sas/details_extract_AAD2024_MIT.sas → details_base.csv, 1.6GB)
  → sas/build_details_table.py → data/details/*.json (82 anchors)
  → details_v2.html fetches at runtime (serve over http: serve.bat)
```
`counts_v2.html`, `matrix_viz.html`, and chord global mode are SAS-rebuilt (16,747-work
universe). `network_viz.html`, chord anchored mode, and `insights.html` still carry embedded
data from the older prototype pipeline (`../MITCollabs/collab.py`). International pages
(`intl_*`) are a separate dataset/pipeline entirely — see `DECISIONS.md`. See `HANDOFF.md`
for exactly what is validated where.

## Pages (all live, all in the shared nav, Key first)
key.html · details_v2.html · counts_v2.html · network_viz.html · chord_viz.html ·
matrix_viz.html · insights.html · intl_details_table.html · intl_map.html · intl_trends.html

The nav has a visual divider before the three International pages (different dataset, own
conventions — see `DECISIONS.md`).

## Working rules for this folder
- **App-tool/shell divergence** (not OneDrive-specific — confirmed repeatedly on this plain
  local folder too): after a file has had several Edit-tool calls in a session, the shell's
  view of it can lag or show a stale/truncated snapshot even though the real file is fine.
  The `Read` tool is authoritative — trust it over shell `cat`/`tail`/`wc`/`node --check`. If
  you need to prove a file is genuinely broken (not just stale), Write a fresh-named copy and
  test that instead of re-editing in place. Full detail in `qa/README.md`.
- Shell calls are capped ~45s and don't preserve background processes across calls; chunk
  long jobs with intermediate/pickled state.
- Git works from this folder — real repo, pushes to GitHub normally (see below). Large/raw
  data files are excluded via `.gitignore`; check it before adding new bulk data files so a
  push doesn't blow up with oversized-file rejections again.
- Design: AcA Blue #254467 headers, Open Sans + Crimson Text, shared `.aa-nav` on every page.

## GitHub
- Org: Academic-Analytics-LLC · repo: `Academic-Analytics-LLC/mit-collabs` · branch: `main`
- gh CLI authenticated as nshahAA (on the user's machine)
- `worker/` (Cloudflare Worker) powers the "Ask the data" chat widget embedded on every page —
  see `AGENT_SETUP.md` for the deploy runbook. Operational as of 2026-07-11.
