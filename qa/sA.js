const { JSDOM } = require('/tmp/node_modules/jsdom');
const fs=require('fs');
const B='/sessions/clever-blissful-carson/mnt/collab-mit/';
const noop=()=>{}; const fakeCtx=new Proxy({},{get:(t,k)=>(k==='canvas'?null:noop),set:()=>true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
const T=(n,p,i='')=>results.push({name:n,pass:!!p,info:String(i).slice(0,80)});
function load(f){const html=fs.readFileSync(B+f,'utf8');
  return new JSDOM(html,{url:'http://localhost/'+f,runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>fakeCtx;w.requestAnimationFrame=()=>0;
      w.URL.createObjectURL=b=>{w.__b=b;return 'blob:x'};w.URL.revokeObjectURL=noop;w.HTMLAnchorElement.prototype.click=noop;
      w.__errors=[];w.addEventListener('error',e=>w.__errors.push(String(e.message).slice(0,70)));}});}
(async()=>{
  for(const [f,sel,wait] of [['counts_table.html','#body tr',2500],['counts_simple.html','tbody tr',2200],
                              ['matrix_viz.html','#tbl tr',2200],['insights.html','tbody tr',4200]]){
    const dom=load(f); await sleep(wait);
    const w=dom.window,d=w.document;
    T(f+' error-free',w.__errors.length===0,w.__errors[0]||'');
    T(f+' renders',d.querySelectorAll(sel).length>0,'n='+d.querySelectorAll(sel).length);
    if(f==='counts_simple.html'){
      const cards=d.body.textContent;
      T('counts_simple cards populated',/16,738/.test(cards)&&/4,923/.test(cards));
      T('counts_simple physics row',/948/.test(cards));
    }
    if(f==='counts_table.html'){
      T('counts physics oracle',d.getElementById('cards').textContent.includes('948')&&d.getElementById('cards').textContent.includes('231'));
    }
    dom.window.close();
  }
  fs.writeFileSync('/tmp/qa2/suiteA.json',JSON.stringify(results,null,1));
  console.log(results.map(r=>(r.pass?'PASS ':'FAIL ')+r.name+' '+r.info).join('\n'));
})();
