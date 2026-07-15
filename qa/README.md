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
4. **Verbatim-extraction Node harness** (2026-07-13/14, used to validate `network_viz.html`'s
   new Bridges feature): for a page too large for jsdom, don't bother stubbing a full DOM —
   copy the page's actual `<script>` body verbatim into a standalone `.js` file, stub only what
   it touches (`document.getElementById` returning cheap mock elements, a no-op canvas
   `getContext`, `window`/`location`/`URLSearchParams`/`requestAnimationFrame`), and optionally
   load the REAL embedded `<script id="data" type="application/json">` blob straight out of the
   page's HTML via `fs.readFileSync` + `indexOf`/`slice` (a loose regex misses the tag if it has
   extra attributes — match the literal opening tag string). This runs the exact production
   logic against real data and catches real bugs (verified the Bridges layout's node geometry —
   min pairwise distance vs. theoretical even-spacing distance — and reproduced exact numbers
   from a user-provided screenshot).
5. **The app-tool/shell divergence in item 1 is NOT bash-only — `Grep` goes stale too,
   sometimes worse than bash.** Confirmed 2026-07-14: after several Edit-tool calls to the same
   scratch file, both `bash wc -l` AND the `Grep` tool's line-count reported a SMALLER total
   than the true file (verified via `Read`, which is authoritative) — in one case Grep's count
   was even less current than a stale bash read taken moments earlier. Don't reach for Grep as
   a "safer than bash" fallback for verifying a just-edited file's true size/content — only
   `Read` is trustworthy for that. The fix is unchanged from item 1(c): reconstruct the full
   content via `Read` (chunked around any giant single-line embedded-data blob) and `Write` it
   fresh to a brand-new filename in one shot, then run/inspect that copy.
6. **Git plumbing is now the standard (not just fallback) way to commit in this repo from the
   Cowork sandbox**, because the git index here corrupts on essentially every `git add`/`git
   commit` — not occasionally. Recipe: `git hash-object -w <file>` for each changed file →
   `git cat-file -p HEAD^{tree} > tree.txt` → `sed` in the new blob hash(es) for the changed
   path(s) → `git mktree < tree.txt` → `git commit-tree -p HEAD -m "..." <newtree>` →
   `git update-ref refs/heads/main <newcommit>` → `git read-tree HEAD` to rebuild the working
   index so `git status` behaves normally again afterward. Stale `.git/HEAD.lock` /
   `.git/refs/heads/main.lock` / `.git/index.lock` files block `update-ref` and can't be `rm`'d
   or `mv`'d in this sandbox ("Operation not permitted") without first calling
   `allow_cowork_file_delete` on the folder — do that before troubleshooting further, it's not a
   real permissions problem. Separately: **this sandbox cannot `git push`** — no `gh` CLI, no
   credential helper, `git push` fails with "could not read Username for 'https://github.com'".
   Build and land commits locally from the sandbox, then hand the actual push off to the user
   (their machine already has working `gh auth`).

   **CRITICAL CORRECTION (2026-07-14 incident, read this before you `hash-object` anything):**
   step 1 above (`git hash-object -w <file>` run directly against the live working file) is
   **not safe** when that file has had several Edit-tool calls this session. It reads through
   the exact same stale/FUSE-mounted filesystem view that item 1 above describes for
   `cat`/`grep`/`node fs.readFileSync` — git is not exempt. It will return a hash and report
   success with ZERO error message, but the object it wrote can be a stale, truncated snapshot
   (or, observed once, the right total length but padded with trailing NUL bytes past the real
   EOF). This actually happened: four commits in a row (`3c1bf85`, `4e28c03`, `19df0be`,
   `cf15c7f`) each silently committed corrupted versions of the file they touched
   (`key.html`, `counts_v2.html`, `network_viz.html` twice, `intl_trends.html`) — all pushed to
   `origin/main` and served live on GitHub Pages before anyone noticed, because `network_viz.html`
   losing its entire back half (including all the Bridges feature code) also meant losing its
   closing `</script></body></html>`, which makes the WHOLE PAGE fail silently (browser throws a
   parse error on the truncated inline script, so no init code ever runs — page renders with just
   static HTML/filters, no data, no console-visible error unless you open devtools). The user
   caught it by testing the live GitHub Pages URL, not from anything in this sandbox.
   **Fix/prevention**: never trust a successful `git hash-object -w <live-file>` at face value on
   a file that's been through multiple edits. Instead: reconstruct the file's true content via
   the `Read` tool (chunk around any giant single-line embedded-data blob), `Write` it to a
   brand-new filename the shell has never touched, THEN `hash-object` that fresh file (a file's
   FIRST bash access in a session is reliable per item 1's existing guidance — the staleness only
   sets in after repeated access/edits to the same path). Before trusting the resulting blob,
   verify: `git cat-file -s <hash>` matches the size you expect, and `git cat-file -p <hash> |
   tail -c 200` actually ends with the file's real closing tags — do this check for EVERY file
   you commit this way, every time, no exceptions. If a file is too large to fully reconstruct
   via Read (e.g. `network_viz.html`/`counts_v2.html`'s ~5-30MB single-line embedded data), you
   can instead take the ALREADY-COMMITTED (bad) blob via `git cat-file -p HEAD:<file>`, which
   reads from git's own object store and is NOT subject to this staleness bug, find the exact
   byte offset where its known-good prefix ends (e.g. `grep -bo` for a function name just before
   where you suspect truncation), and splice in a correct suffix reconstructed via Read.

7. **(2026-07-14, network_viz.js iterative-edit session) Two more findings on top of item 6:**
   (a) **`git update-index --add --cacheinfo ...` corrupts the index the same way `git add`/`git
   commit` do** (`bad signature 0x00000000`, `fatal: index file corrupt`) — it's not just those
   two porcelain commands, it's ANY write to `.git/index` in this sandbox. The safe plumbing
   recipe (item 6) must therefore never call `update-index` either: build the tree entirely via
   `mktree`/`cat-file -p <tree>`/`sed`, and touch `.git/index` exactly once, at the very end, via
   `git read-tree HEAD` — a read, not a write — purely to make `git status` behave normally
   again. If a stale `.git/index` or `.git/index.lock` is already corrupt from a prior attempt,
   `rm -f .git/index.lock .git/objects/*/tmp_obj_* .git/index` (after
   `allow_cowork_file_delete`) then `git read-tree HEAD` rebuilds it clean.
   (b) **A cheaper verified-edit technique for incremental changes to a file already safely
   committed once**: instead of re-reading the ENTIRE live file via `Read` (expensive past
   ~1500 lines) to get a hash-object-safe copy, pull the file's last known-good content straight
   from git's own object store — `git cat-file -p HEAD:<file> > base.js`, immune to the
   stale-mount bug since it never touches the working-tree file — then replay the *exact* same
   `old_string`/`new_string` pairs given to the `Edit` tool as a Python `str.replace(old, new,
   1)`, asserting `count(old) == 1` first so a bad/stale match fails loudly instead of silently
   doing nothing. `node --check` the reconstructed file, then `git hash-object -w` **that** file
   (never the live one) for the commit. Used successfully across 4 incremental commits to
   `network_viz.js` in one session (each edit applied on top of the last commit's blob) without
   ever needing a full-file `Read`+`Write` reconstruction. Caveat that cost a failed attempt:
   some JS source stores unicode escapes literally as 6 ASCII characters (e.g. `·`, not the
   rendered `·` glyph) — a Python string containing the actual glyph won't match; use a
   non-raw Python string with `·` (or equivalent) to get the literal escape text instead of
   pasting the rendered character. Separately, confirmed (again) that plain `node --check`/`wc
   -l` on the live working file after an `Edit`-tool call reports a truncated/syntactically-broken
   view — expected per item 1, not real corruption; the `Read` tool and the git-object-store
   extraction above are what to trust.

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
since no SAS engine exists in this sandbox), `build_counts_simple_v3.py`/`_v4.py` (production
work-grain rebuild, same stand-in reasoning — v4 adds college/units/years/titles/details),
`build_counts_simple_export.sas` (the REAL SAS version for the user to run in their own
environment - produces the matching CSVs, **not yet updated to the v4 schema** - see below),
and `reshape_counts_simple_export.py` (purely mechanical CSV→JSON pivot for whichever of the
two sources - Python stand-in or real SAS export - is being wired in; contains zero counting
logic). `data/counts_simple_v3.json` is the current output, patched into `counts_v2.html`'s
(page was later renamed from `counts_simple.html`) embedded `<script id="data">` blob in
place (same precedent as matrix/chord global's earlier SAS rebuild - no fetch-at-runtime).

Validated: Physics 948 within / 192 across (matches oracle); MIT institution all_works=16,747
(SAS universe, up from prototype's 16,738); Physics within_collabs=5,561 matches
network_viz.html's independently-validated figure exactly. jsdom smoke test (no canvas needed,
plain table page): 36 department rows, person-level (1,270 rows), Work Type/interdisc/cap
filters and CSV export all run with zero exceptions - one harness-only limitation
(`URL.createObjectURL` unstubbed in jsdom), not a page bug, same class of quirk as below.

Two field definitions (`nAuthors`, `interdisc`) had to be reverse-engineered since the old
`build_counts_simple3.py` source isn't available in this repo/sandbox (lives in the
un-mounted `MITCollabs` sibling) - cross-checked against the live page's own old embedded
data: `nAuthors` max/min matched EXACTLY (292/2 both sides); `interdisc` flagged 68.6% of
works vs the old data's 68.9% (close, within the expected small work-universe variance, not
an exact-match proof). Flagged for user sign-off; not independently re-derivable without the
original prototype source.

`counts_table.html` itself (the old "Counts (Partners)" page, unrelated to the counts_v2
migration above) was retired sitewide 2026-07-10 and deleted from disk. The project no longer
has an OneDrive copy at all (moved permanently to `C:\dev\collab-mit`), so the old "can't
delete the OneDrive copy" blocker is moot.

## Validation verdicts — do not re-litigate without new data

- Matrix (723/723 unit + 27/27 college cells) and chord global (27/27): EXACT vs SAS.
- Chord anchored data ≡ counts data (tie-row ORDER differs — cosmetic).
- Counts partner rows follow the portal's same-unit-kind convention (Physics partner rows
  sum to the oracle 231). Do NOT "fix" this to all-affiliation attribution.
- **RESOLVED (2026-07-07):** the authoritative work universe is **16,747** (the SAS extract).
  The two pipelines agree almost exactly at the per-unit metric level (identical Physics
  numbers); the only real difference was total universe size, concentrated in a few HST/IMES
  conference abstracts present in the prototype dataset but absent from SAS. Every earlier
  "off by a few works" mismatch between the prototype-fed pages and the SAS oracle traces to
  this now-closed gap, not a live bug.
- Counts college/person tabs use the prototype's person-centric any-overlap classification;
  multi-affiliated people differ from anchor-relative recomputes BY DESIGN, not a bug.
