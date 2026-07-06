const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
        BorderStyle, WidthType, ShadingType, LevelFormat, AlignmentType, Footer, PageNumber,
        TabStopType, TabStopPosition } = require('/tmp/node_modules/docx');
const fs = require('fs');
const NAVY="254467", LIGHT="E9EEF5";
const border={style:BorderStyle.SINGLE,size:1,color:"CCCCCC"};
const borders={top:border,bottom:border,left:border,right:border};
const H1=t=>new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun(t)]});
const body=(t)=>new Paragraph({spacing:{after:120},children:[new TextRun({text:t,size:21})]});
const bullet=t=>new Paragraph({numbering:{reference:"bullets",level:0},spacing:{after:60},children:[new TextRun({text:t,size:21})]});
function cell(t,{w,head=false,fill}={}){
  return new TableCell({borders,width:{size:w,type:WidthType.DXA},
    shading: head?{fill:NAVY,type:ShadingType.CLEAR}:(fill?{fill,type:ShadingType.CLEAR}:undefined),
    margins:{top:60,bottom:60,left:100,right:100},
    children:[new Paragraph({children:[new TextRun({text:t,size:19,bold:head,color:head?"FFFFFF":undefined})]})]});
}
function table(widths,rows){
  return new Table({width:{size:widths.reduce((a,b)=>a+b,0),type:WidthType.DXA},columnWidths:widths,
    rows:rows.map((r,i)=>new TableRow({children:r.map((c,j)=>cell(String(c),{w:widths[j],head:i===0,fill:i%2===0&&i>0?LIGHT:undefined}))}))});
}
const children=[
  new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun("MIT Collaboration Report — Overnight Deep QA Run")]}),
  body("AAD2024-2904 · MIT · Run date: July 3–4, 2026. This supplements the July 3 QA and Data Validation Report. Scope: exhaustive per-anchor data recomputation, a 37-test functional suite, and layout/token checks across all 8 pages, following the evening's changes (report-format headers, split unit-type columns, Medical gating, year multi-select, clinical removal, Key page)."),

  H1("1. Fixes made during this run"),
  bullet("Network legend is now level-aware: rank colors at Person/Anchor levels, college/school colors at Department and College / School levels (previously the rank legend showed at every level — the confusion you screenshotted)."),
  bullet("Counts (Simple) blank-numbers screenshot: diagnosed as the OneDrive sync race serving a mid-write file to the browser; the file self-healed when sync completed and passes all tests. Hard refresh shows it correctly. No code change needed — but this is the third sync-race incident; moving the project out of OneDrive remains strongly recommended."),

  H1("2. Deep data validation — every anchor, every page"),
  body("Every number was recomputed from scratch in Python from data/details/*.json (SAS pipeline) and compared to each page's embedded data. 74 anchor units × all partner rows, plus full matrices."),
  table([3350,3020,2990],[
    ["Check","Result","Notes"],
    ["Matrix — all unit×unit cells, Department + Program modes","723 / 723 cells exact","independent reimplementation, not the build script"],
    ["Matrix — college×college cells","27 / 27 exact","mode-correct recompute"],
    ["Chord — College / School overview matrix","27 / 27 exact",""],
    ["Chord anchored data ≡ Counts (Partners) data","Identical (order-insensitive), all 4 caps","rows with tied values sort differently between the two pages — cosmetic only"],
    ["Counts (Partners) — within-unit works, per anchor","72 / 74 exact","2 off-by-one: Health Sciences and Technology, IMES (phantom-work variance, below)"],
    ["Counts (Partners) — every partner-unit row, per anchor","59 / 74 anchors fully exact","residual diffs ≤2 works, all on HST/IMES-linked units; partner lists follow the portal's same-unit-kind convention (validated: Physics partner rows sum to the oracle 231)"],
    ["Counts (Partners) — every external-institution row","8,175 rows exact; 535 rows differ by small amounts","direction: page lower in 494 (SAS holds a few extra works); universe variance"],
    ["Network — pair-for-pair edge weights, per anchor","58 / 74 anchors pair-exact","16 anchors have ≤6 extra pairs each; every checked extra pair traces to a work present in the prototype dataset but absent from all SAS files (verified example: an ATS conference abstract)"],
    ["Counts (Simple) — department rows","28 exact / 6 within ±3 / 1 larger (IMES)","universe variance again"],
    ["Counts (Simple) — college + person rows","1,088 / 1,270 persons exact; colleges diverge","non-exact rows are multi-affiliated people: the page uses the prototype's person-centric any-overlap classification; an anchor-relative recompute necessarily differs. Documented convention, flagged as open item below"],
    ["Insights — degree centrality, top 80 scholars","78 / 80 exact","the 2 misses are the HST phantom-works people (Celi, Langer)"],
    ["Insights — overview totals","1,270 scholars ✓; 16,738 works vs SAS 16,747","the known 9-work cross-extract variance"],
  ]),
  body("Phantom-work variance, pinned down: the prototype dataset contains a small number of works (concentrated around Health Sciences and Technology / IMES, e.g. conference abstracts) that appear in zero SAS extract files, and the SAS extract contains ~9 net additional works. This single root cause explains every off-by-small mismatch above. Resolution requires deciding which extract is authoritative — flagged since the first QA report."),

  H1("3. Functional test suite — 37 tests, all passing"),
  bullet("All 8 pages load with zero JavaScript errors and render content (rows/arcs/cells/cards)."),
  bullet("Counts (Partners) shows the portal oracle numbers (948 / 231); Counts (Simple) cards and Physics row verified (16,738 / 4,923 / 948)."),
  bullet("Network: deep-link (?pid&anchor&scope) selects the person and opens their panel; default scope is All; level buttons ordered College / School → Department → Anchor → Person; legend switches with level."),
  bullet("Details: headers exactly match the reviewed report format; CSV row count equals the on-screen total (7,232 = 7,232) and field counts align; unique-works CSV rows equal distinct works (1,993 = 1,993); year multi-select lists only data years (14), filters, and Clear Filters restores baseline; zero 'clinical' in authored UI text (Clinical Trial work type and two AA discipline names are data values, intentionally retained)."),
  bullet("Key page: all 17 sidebar links resolve; 8-page nav; AAD sentence and unit-type text as requested."),

  H1("4. Look and layout"),
  bullet("Every page: AcA Blue #254467 (37,68,103) header, Open Sans/Crimson Text fonts, identical 8-link nav with Key first, consistent footers (institutionid removed)."),
  bullet("No headless browser is available in this environment, so no pixel-level screenshots were possible. Recommended 5-minute human pass: matrix heat colors, chord ribbon proportions, Details column density in All mode, Key page sidebar behavior."),

  H1("5. Open items (priority order)"),
  bullet("Counts (Simple) college and person tabs, and the person view on Counts (Partners), still run on the prototype's classification. Either rebuild them from the SAS extract (recommended; the Details/matrix/chord-global rebuilds show the pattern) or add a Key note stating the person-centric convention."),
  bullet("Decide the authoritative work universe (SAS 16,747 vs prototype 16,738) and rebuild the remaining prototype-fed pages (network, counts, insights embedded data) from it."),
  bullet("Move the project folder out of OneDrive or pause sync during work — three separate truncation/staleness incidents now confirmed."),
  bullet("Insights betweenness values remain unverified (degree now spot-validated)."),
];
const doc=new Document({
  numbering:{config:[{reference:"bullets",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:540,hanging:270}}}}]}]},
  styles:{default:{document:{run:{font:"Arial",size:21}}},
    paragraphStyles:[{id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:29,bold:true,font:"Arial",color:NAVY},paragraph:{spacing:{before:260,after:150},outlineLevel:0}}]},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:940,bottom:1080,left:940}}},
    footers:{default:new Footer({children:[new Paragraph({tabStops:[{type:TabStopType.RIGHT,position:TabStopPosition.MAX}],children:[
      new TextRun({text:"AAD2024-2904 · MIT Collaboration Report · Overnight QA · July 2026",size:16,color:"888888"}),
      new TextRun({children:["\tPage ",PageNumber.CURRENT],size:16,color:"888888"})]})]})},
    children}],
});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync('/tmp/QA_Overnight.docx',b);console.log('written',b.length);});
