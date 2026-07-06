# Design Reference — Academic Analytics Portal (pulled 2026-07-01)

Source: live portal (https://portal.academicanalytics.com/), homepage + Benchmarking > Department > Collaborations
and > Metrics tabs for MIT Aerospace Engineering (unit 8926). Pulled via browser inspection (computed styles),
not guessed from screenshots. This supersedes v1's navy/crimson scheme as the current company standard.

## Typography
- Body font: `"Open Sans", sans-serif`, base size 14px, body text color `#212529`
- Headings: `"Crimson Text", serif` (e.g. page title "Aeronautics and Astronautics, Department of")
- Small-caps bold labels for card headers (e.g. "PRODUCTIVITY RADAR", "BOX PLOTS", "UNIT METRICS")

## Color palette
- Top nav bar: `#254467` (navy) — logo + global nav (Benchmarking, Medical Insight, Research Insight, etc.)
- Heading/dark navy text: `#052448`
- Body background: `#f7f7f7`; card background: `#fff`
- Link/accent blue: `#0066b4`
- Help / secondary accent: orange pill button, bottom-right floating "Help"
- Chart node colors reuse `#254467` (navy) alongside a d3-style categorical palette (observed purple `#9467bd`;
  screenshot also showed orange and green nodes consistent with d3's category10 scheme, but with navy swapped
  in for the usual blue) — i.e. brand navy + standard categorical accents for multi-series charts
- Data bars/gauges: light blue track (`~#c9dcf0`-ish) with darker blue fill and a red/maroon dot marker for
  "your value" (seen in Box Plots widget)

## Layout patterns
- Global nav: dark navy bar, logo left, institution switcher center, user menu right; second-row light nav
  with underlined active tab
- Breadcrumb-style level switcher: Custom / Institution / Broad Field / College-School / Department / Division / Program
- Page header: large serif title + a pill/badge showing current selection (e.g. "AEROSPACE ENGINEERING | DEFAULT WEIGHTS")
  + summary stats row (Institutions / Departments / Faculty / Scholarly Research Index) + "Download Full Data" link
- Filter bar: pill-style dropdown buttons (PEERS, INSTITUTION TYPE, AAU, SECTOR, REGION, STATE, CARNEGIE, LAND GRANT, MSI)
- Content tabs below header: Overview / Metrics / Faculty / Market Share / Collaborations / Unit Modeling
- Dashboard = grid of white cards, each with: small-caps bold title, top-right icon row (download/export/expand),
  and its own internal filter dropdown (e.g. "ARTICLES ▾")
- Tables: sortable column headers (↕ icons), zebra-free plain white rows, inline mini progress-bars for metric values

## Existing "Collaborations" page (portal's own network viz — direct functional precedent for our Network Viz page)
URL pattern: `/benchmarking/department/{unitId}/{n}/collaborations`
- Left panel: Scholar scope radio (Within Unit / Across Units / Across Institutions), "Include Medical" toggle,
  "Scholar Collaborations" and "Filter By Type" expandable sections, and a Legend
- Legend encodes: node type via color, edge volume via line thickness ("Volume of Collaborations"), distinct
  collaborators via circle marker, and work type via line style (solid = Articles, dashed = Books/Grants/
  Conference Proceedings/Book Chapters, each a different color/dash pattern)
- Force-directed layout, name labels on nodes, navy nodes vs. purple nodes (likely internal vs. external, or
  rank-based — needs confirming against `collab.py`'s node attr logic)
- Explicitly described by the user as "very rudimentary" — v2 should adapt the color/type language but go
  further on interactivity and polish, not just replicate it

## Implication for v2 build
- Phase 2 base template should use: Open Sans body / Crimson Text headings, navy `#254467` header,
  `#f7f7f7` page background, `#0066b4` accent/links, white cards with small-caps bold headers and a top-right
  utility icon row (download/expand) — this is the current company look, not v1's navy/crimson.
- Network/Chord pages can borrow the portal's scope-toggle + type-legend interaction pattern (Within/Across/
  Inter, work-type line styles) since users are already trained on that mental model from the live tool.
