import json,re,pickle
OUT=open('/tmp/qa2/validation_results3.txt','a')
def log(*a):
    print(*a); OUT.write(' '.join(str(x) for x in a)+'\n'); OUT.flush()
def data_of(f):
    with open(f,encoding='utf-8') as fh:
        for line in fh:
            if 'id="data"' in line and len(line)>5000:
                return json.loads(re.search(r'>(.*)$',line).group(1).rstrip().removesuffix('</script>'))
S2=pickle.load(open('/tmp/qa2/state2.pkl','rb'))
S=pickle.load(open('/tmp/qa2/state.pkl','rb'))
cs=data_of('counts_simple.html')

def tup(sets):
    w,a,i=sets
    return (len(w),len(a),len(i),len(w|a),len(w|a|i))
def cmp_rows(rows,sasmap,name):
    ok=off=big=0; exs=[]; missing=0
    for r in rows:
        s=sasmap.get(r.get('id')) or sasmap.get(r.get('label'))
        if s is None: missing+=1; continue
        sas=tup(s)
        vals=(r['within'],r['across'],r['inter'],r['intra'],r['all'])
        d=max(abs(x-y) for x,y in zip(vals,sas))
        if d==0: ok+=1
        elif d<=3: off+=1
        else:
            big+=1
            if len(exs)<3: exs.append((r['label'][:30],vals,sas))
    log(f'CHECK 7 counts_simple {name}: exact',ok,'| small diff(<=3)',off,'| larger',big,'| unmatched',missing, exs if big else '')

cmp_rows(cs['department']['Department'],S['per_entity'],'departments (Department tab)')
cmp_rows(cs['college']['Department'],S2['per_college'],'colleges (Department tab)')
cmp_rows(cs['person']['Department'],S2['per_person'],'persons (Department tab, all 1270)')

# matrix college cells vs mode-correct recompute
matx=data_of('matrix_viz.html')
cd_=matx['Department']['all']['college']
labs=cd_['labels']; li={l:i for i,l in enumerate(labs)}
emb={}
for c in cd_['cells']: emb[(min(c[0],c[1]),max(c[0],c[1]))]=sum(c[2])
mism=checked=0; exs=[]
for k,ws in S2['pair_coll'].items():
    ks=sorted(k); i=li.get(ks[0]); j=li.get(ks[-1])
    if i is None or j is None: continue
    checked+=1
    got=emb.get((min(i,j),max(i,j)),0)
    if got!=len(ws):
        mism+=1
        if len(exs)<3: exs.append((ks,got,len(ws)))
log('CHECK 6b matrix college cells (mode-correct): checked',checked,'mismatch',mism,exs if mism else '')

# chord global vs same college pairs
chord=data_of('chord_viz.html')
g=chord['global']['all']['Department']
gl=g['labels']; gi={l:i for i,l in enumerate(gl)}
mism=checked=0
for k,ws in S2['pair_coll'].items():
    ks=sorted(k); i=gi.get(ks[0]); j=gi.get(ks[-1])
    if i is None or j is None: continue
    checked+=1
    if g['matrix'][i][j]!=len(ws): mism+=1
log('CHECK 6c chord global college matrix: checked',checked,'mismatch',mism)

# insights: extract inline const D
src=open('insights.html',encoding='utf-8').read()
m=re.search(r'const D=(\{.*?\});\nconst OV',src,re.S)
ins=json.loads(m.group(1)) if m else None
if ins:
    mism=checked=0; exs=[]
    pd=S['person_deg']
    for s in ins['scholars'][:80]:
        pid=str(s['pid']); sasdeg=len(pd.get(pid,set()))
        checked+=1
        if s['degree']!=sasdeg:
            mism+=1
            if len(exs)<4: exs.append((s['name'][:18],s['degree'],sasdeg))
    log('CHECK 8 insights degree (top-80) vs SAS distinct collaborators: exact',checked-mism,'mismatch',mism,exs)
    log('CHECK 8 overview: works',ins['overview']['n_works'],'vs SAS',len(S['sas_wids']),'| scholars',ins['overview']['n_scholars'])
else:
    log('CHECK 8: could not extract insights data')
OUT.close(); print('DONE2')
