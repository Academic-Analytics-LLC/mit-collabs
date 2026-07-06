const { JSDOM } = require('/tmp/node_modules/jsdom');
const fs=require('fs');
const B='/sessions/clever-blissful-carson/mnt/collab-mit/';
const noop=()=>{}; const fakeCtx=new Proxy({},{get:(t,k)=>(k==='canvas'?null:noop),set:()=>true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const T=(n,p,i='')=>results.push({name:n,pass:!!p,info:String(i).slice(0,80)});
function load(f,qs=''){const html=fs.readFileSync(B+f,'utf8');
  return new JSDOM(html,{url:'http://localhost/'+f+qs,runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>fakeCtx;w.requestAnimationFrame=()=>0;
      w.__errors=[];w.addEventListener('error',e=>w.__errors.push(String(e.message).slice(0,70)));}});}
(async()=>{
  let dom=load('chord_viz.html'); await sleep(3000);
  T('chord error-free',dom.window.__errors.length===0);
  T('chord 7 school arcs',dom.window.document.querySelectorAll('#chord .arc').length===7);
  dom.window.close();
  dom=load('network_viz.html','?pid=86061&anchor=Architecture%2C%20Department%20of&scope=all'); await sleep(3200);
  {const w=dom.window,d=w.document;
   T('network deep-link error-free',w.__errors.length===0,w.__errors[0]||'');
   T('deep-link selects person',w.eval('selectedIdx>=0&&nodes[selectedIdx].name.startsWith("NORFORD")'));
   T('deep-link opens panel',!d.getElementById('detPanel').classList.contains('hidden'));
   T('default scope = All',[...d.querySelectorAll('#scope button')].find(b=>b.classList.contains('on')).dataset.sc==='all');
   T('legend person=Rank',d.getElementById('legend').textContent.includes('Rank'));
   [...d.querySelectorAll('#lvl button')].find(b=>b.dataset.lv==='department').onclick();
   T('legend dept=College / School',d.getElementById('legend').textContent.includes('College / School'));
   T('level order big-to-small',[...d.querySelectorAll('#lvl button')].map(b=>b.textContent).join(',')==='College / School,Department,Anchor,Person');
  }
  dom.window.close();
  dom=load('key.html'); await sleep(800);
  {const d=dom.window.document;
   const toc=[...d.querySelectorAll('.toc-list a')].map(a=>a.getAttribute('href').slice(1));
   const ids=new Set([...d.querySelectorAll('section[id],h3[id]')].map(e=>e.id));
   T('key TOC resolves',toc.every(t=>ids.has(t)),toc.length+' links');
   T('key nav 8 links',d.querySelectorAll('.aa-nav a').length===8);
   T('key AAD sentence clean',d.body.textContent.includes('comparative database AAD2024-2904.')&&!d.body.textContent.includes('institutionid'));
   T('key no Data source callout',!d.body.textContent.includes('Data source'));
   T('key three unit types',d.body.textContent.includes('three types'));
  }
  fs.writeFileSync('/tmp/qa2/suiteB.json',JSON.stringify(results,null,1));
  console.log(results.map(r=>(r.pass?'PASS ':'FAIL ')+r.name+' '+r.info).join('\n'));
})();
