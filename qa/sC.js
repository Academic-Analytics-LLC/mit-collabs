const { JSDOM } = require('/tmp/node_modules/jsdom');
const fs=require('fs');
const B='/sessions/clever-blissful-carson/mnt/collab-mit/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const T=(n,p,i='')=>results.push({name:n,pass:!!p,info:String(i).slice(0,90)});
const anchorsFull=JSON.parse(fs.readFileSync(B+'data/details/anchors.json','utf8'));
const trimmed={anchors:anchorsFull.anchors.filter(a=>['U8927','U1902','U147078'].includes(a.key)||a.kind==='college')};
const html=fs.readFileSync('/tmp/dq2.html','utf8');
const dom=new JSDOM(html,{url:'http://localhost/details_table.html',runScripts:'dangerously',pretendToBeVisual:true,
  beforeParse(w){w.__errors=[];w.addEventListener('error',e=>w.__errors.push(String(e.message).slice(0,70)));
    w.URL.createObjectURL=b=>{w.__b=b;return 'blob:x'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
    w.fetch=p=>Promise.resolve({ok:true,json:()=>Promise.resolve(
      String(p).endsWith('anchors.json')?trimmed:JSON.parse(fs.readFileSync(B+String(p),'utf8')))});}});
(async()=>{
  const w=dom.window,d=w.document;
  for(let i=0;i<80;i++){if(!/Loading/.test(d.getElementById('statusText').textContent))break;await sleep(250);}
  T('details error-free',w.__errors.length===0,w.__errors[0]||'');
  const heads=[...d.querySelectorAll('#head th')].map(t=>t.textContent.replace(/[▲▼]/g,'').trim());
  T('headers match reviewed format',heads.slice(0,10).join('|')==='Faculty Name|Department|Works|Collaboration Type|Year|Collab ID|Collab Detail|Collab Title|Collab Institution|Collab Faculty Name',heads.join('|').slice(0,90));
  d.getElementById('downloadCsv').onclick();
  const csv=await w.__b.text(); const L=csv.split('\n');
  const statusRows=parseInt(d.getElementById('statusText').textContent.match(/([\d,]+)\s*rows/)[1].replace(/,/g,''));
  T('CSV rows == on-screen total',L.length-1===statusRows,(L.length-1)+' vs '+statusRows);
  T('CSV header fields == first-row fields',L[0].split(',').length===(L[1].match(/","/g)||[]).length+1,L[0].split(',').length);
  T('CSV spelled-out headers',L[0].includes('Collab Faculty Name')&&L[0].includes('Collab Department(s)'));
  T('CSV no clinical unit refs',!/Medical\/Clinical|\(Clinical\)/.test(L[0]));
  d.getElementById('uniqueWorks').checked=true; w.eval('onFilterChange()');
  d.getElementById('downloadCsv').onclick();
  const csv2=await w.__b.text(); const L2=csv2.split('\n');
  const distinct=parseInt(d.getElementById('statusText').textContent.match(/([\d,]+)\s*distinct/)[1].replace(/,/g,''));
  T('unique CSV rows == distinct works',L2.length-1===distinct,(L2.length-1)+' vs '+distinct);
  d.getElementById('uniqueWorks').checked=false; w.eval('onFilterChange()');
  const ys=d.getElementById('yearSel');
  T('year multiselect data-years only',[...ys.options].every(o=>/^\d{4}$/.test(o.value))&&ys.options.length>3,ys.options.length+' yrs');
  const opt=[...ys.options].find(o=>o.value==='2023'); opt.selected=true; ys.onchange();
  const after=d.getElementById('statusText').textContent;
  T('year filter reduces rows',parseInt(after.match(/([\d,]+)\s*rows/)[1].replace(/,/g,''))<statusRows,after.slice(0,30));
  d.getElementById('clearFilters').onclick();
  T('clear filters restores',parseInt(d.getElementById('statusText').textContent.match(/([\d,]+)\s*rows/)[1].replace(/,/g,''))===statusRows);
  T('no clinical in visible UI',!/clinical/i.test(d.body.textContent.replace(/Clinical Trial/g,'').replace(/Clinical (Pathology|Psychology)/g,'')));
  T('final error count 0',w.__errors.length===0,w.__errors[0]||'');
  fs.writeFileSync('/tmp/qa2/suiteC.json',JSON.stringify(results,null,1));
  console.log(results.map(r=>(r.pass?'PASS ':'FAIL ')+r.name+' '+r.info).join('\n'));
  process.exit(0);
})();
