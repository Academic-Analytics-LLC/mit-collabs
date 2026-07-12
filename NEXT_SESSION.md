# Start here — quick orientation for a new session (written 2026-07-10)

This file exists so a fresh conversation doesn't have to re-read the full `HANDOFF.md` (1000+
lines) or reconstruct context from a long prior chat. Read this first; only dig into `HANDOFF.md`'s
dated entries if you need the full story behind one of the items below.

Still follow `CLAUDE.md`'s normal reading order (this file, then `HANDOFF.md` top section, then
`DECISIONS.md`, then `qa/README.md`) — this is just a faster on-ramp layered on top of that.

## What just happened (2026-07-10 session)

- `network_viz.html`: ego view redesigned (grid-packed "blob" zones instead of concentric rings,
  no connector lines from center, thick-solid vs thin-dashed borders for internal/external).
- `network_viz.html`: fixed a bug where the fingerprint panel's work-type counts (Articles, Grants,
  etc.) summed per-collaborator instead of deduping by distinct work — was wildly inflating numbers
  for people with many co-authors (e.g. showed 1481 "Articles" for one scholar). Fixed by deduping
  via work ID, labeled "capped sample" since the underlying wids data caps at 8 per pair.
- `counts_table.html` ("Counts (Partners)" page) removed from nav on every page, file deleted from
  dev + MITCollabs copies. **Not deleted from the OneDrive `collab-mit` copy** — the
  `allow_cowork_file_delete` tool errors "could not find mount" for that specific folder no matter
  the path format tried. Someone should delete that file manually, or a future session can retry
  the tool in case it was transient.
- `counts_simple.html`: reworded a misleading methodology note (Works vs. Collaborations
  multiplicity) on all 3 copies (dev, OneDrive collab-mit, MITCollabs).
- `details_table.html` (**dev copy only, not yet synced to OneDrive/MITCollabs**):
  - Default sort is now Faculty Name → Collaboration Type → Year descending (was Faculty Name →
    Collaboration Type → Total Collaborators).
  - Collaboration-type checkboxes reordered into a 2-row grid.
  - Removed the old single fuzzy "Search" box. Replaced with a "Title contains" box (title only)
    and a proper **Select Faculty** multi-select dropdown (matches by scholar ID, has its own
    in-box search, narrows its option list based on every other active filter).
  - Removed the footer citation line entirely (was "Source: details_base.csv · ...").
- Task list cleaned up: deleted ~114 stale completed tasks that were bloating every tool-call's
  context (only #51/#52/#53 below remain).

## Open items (the only 3 tracked tasks right now)

- Pick the authoritative work-universe number (16,738 vs 16,747 — small variance between the
  prototype extract and the SAS extract, never resolved).
- Add a note to `key.html` about the Counts (Simple) page's counting convention.
- Deeper validation of `insights.html`'s betweenness/degree centrality numbers.

## Things a new session should know before touching files

- No git in this sandbox (OneDrive blocks it). `C:\dev\collab-mit` has git; the OneDrive
  `collab-mit` copy does not — treat them as separate deploy targets, not one repo.
- `details_table.html` and `counts_simple.html` changes above are dev-copy-only unless told
  otherwise — don't assume the 3 copies are in sync.
- For any file that's had several edits already in the same session, the shell/bash mount can lag
  behind and show a stale/truncated copy even though the Read tool is correct — trust the Read
  tool, not `bash cat`/`node --check`, if they disagree (see memory:
  `feedback-sandbox-quirks-large-csv-processing`).
- Full per-feature technical detail (algorithms, bugs, validation) for anything above lives in
  `HANDOFF.md`'s matching dated entry — search for the heading, don't read the whole file top to
  bottom.
