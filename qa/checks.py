import json,re,pickle
from collections import defaultdict
OUT=open('/tmp/qa2/validation_results3.txt','w')
def log(*a):
    print(*a); OUT.write(' '.join(str(x) for x in a)+'\n'); OUT.flush()
def data_of(f):
    with open(f,encoding='utf-8') as fh:
        for line in fh:
            if 'id="data"' in line and len(line)>5000:
                return json.loads(re.search(r'>(.*)$',line).group(1).rstrip().removesuffix('</script>'))
S=pickle.load(open('/tmp/qa2/state.pkl','rb'))

# CHECK 6: matrix full-cell recompute
matx=data_of('matrix_viz.html')
for mode in ['Department','Program']:
    dd=matx[mode]['all']['department']
    labs=dd['labels']; li={l:i for i,l in enumerate(labs)}
    emb={}
    for c in dd['cells']: emb[(min(c[0],c[1]),max(c[0],c[1]))]=sum(c[2])
    mism=checked=0; exs=[]
    for k,ws in S['pair_units'][mode].items():
        ks=sorted(k); i=li.get(ks[0]); j=li.get(ks[-1])
        if i is None or j is None: continue
        checked+=1
        got=emb.get((min(i,j),max(i,j)),0)
        if got!=len(ws):
            mism+=1
            if len(exs)<3: exs.append((ks,got,len(ws)))
    log(f'CHECK 6 matrix {mode} cells: checked',checked,'mismatch',mism,exs if mism else '')
cd_=matx['Department']['all']['college']
labs=cd_['labels']; li={l:i for i,l in enumerate(labs)}
emb={}
for c in cd_['cells']: emb[(min(c[0],c[1]),max(c[0],c[1]))]=sum(c[2])
mism=checked=0
for k,ws in S['pair_coll'].items():
    ks=sorted(k); i=li.get(ks[0]); j=li.get(ks[-1])
    if i is None or j is None: continue
    checked+=1
    if emb.get((min(i,j),max(i,j)),0)!=len(ws): mism+=1
log('CHECK 6 matrix college cells: checked',checked,'mismatch',mism)

# CHECK 7: counts_simple full comparison
cs=data_of('counts_simple.html')
log('counts_simple keys:',list(cs.keys()))
def cmp_level(embrows, sasmap, name):
    ok=off1=big=0; exs=[]
    for row in embrows:
        lab=row[0] if isinstance(row,list) else row
        vals=row[1:6] if isinstance(row,list) else None
        s=sasmap.get(lab)
        if s is None or vals is None: continue
        w,a,i=s
        sas=(len(w),len(a),len(i),len(w|a),len(w|a|i))
        d=max(abs(x-y) for x,y in zip(vals,sas))
        if d==0: ok+=1
        elif d<=2: off1+=1
        else:
            big+=1
            if len(exs)<3: exs.append((lab,vals,sas))
    log(f'CHECK 7 counts_simple {name}: exact',ok,'| off-by-1/2',off1,'| larger diff',big, exs if big else '')
for key in cs:
    v=cs[key]
    if isinstance(v,list) and v and isinstance(v[0],list) and len(v[0])>=6:
        if key.lower().startswith('dep') or key.lower().startswith('unit'):
            cmp_level(v,S['per_entity'],key)
        elif 'col' in key.lower():
            cmp_level(v,S['per_college'],key)
# CHECK 8: insights degrees
ins=data_of('insights.html')
mism=checked=0; exs=[]
for s in ins['scholars'][:60]:
    pid=str(s['pid']); sasdeg=len(S['person_deg'].get(pid,set()))
    checked+=1
    if s['degree']!=sasdeg:
        mism+=1
        if len(exs)<4: exs.append((s['name'][:20],s['degree'],sasdeg))
log('CHECK 8 insights top-60 degree vs SAS:','exact',checked-mism,'mismatch',mism,exs)
log('CHECK 8 overview works:',ins['overview']['n_works'],'vs SAS distinct',len(S['sas_wids']))
log('CHECK 8 scholars:',ins['overview']['n_scholars'])
OUT.close(); print('DONE')
