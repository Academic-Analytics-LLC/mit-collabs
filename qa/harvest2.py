import json,sys,pickle,os
from collections import defaultdict
lo,hi=int(sys.argv[1]),int(sys.argv[2])
idx=json.load(open('data/details/anchors.json',encoding='utf-8'))
files=sorted([(a['label'],a['file']) for a in idx['anchors'] if a['kind']=='unit' and a['unit_type'] in ('Department','Medical','Clinical')])
P='/tmp/qa2/state2.pkl'
if os.path.exists(P):
    with open(P,'rb') as f: raw=pickle.load(f)
    per_person=defaultdict(lambda:[set(),set(),set()],raw['per_person'])
    pair_coll=defaultdict(set,raw['pair_coll'])
    per_college=defaultdict(lambda:[set(),set(),set()],raw['per_college'])
else:
    per_person=defaultdict(lambda:[set(),set(),set()])
    pair_coll=defaultdict(set)
    per_college=defaultdict(lambda:[set(),set(),set()])
for label,fn in files[lo:hi]:
    p=json.load(open('data/details/'+fn,encoding='utf-8'))
    strs=p['strs']
    minrel={}
    for wid,rows in p['rows_by_work'].items():
        for e in rows:
            if e[0]==e[6]: continue
            k=(wid,e[0],e[6])
            if k not in minrel or e[13]<minrel[k]: minrel[k]=e[13]
    for wid,rows in p['rows_by_work'].items():
        for e in rows:
            if e[0]==e[6]: continue
            mr=minrel[(wid,e[0],e[6])]
            b=0 if mr==0 else 1 if mr==1 else 2
            per_person[e[0]][b].add(wid)
            sc=strs[e[1]] if e[1] is not None else ''
            cc=strs[e[7]] if e[7] is not None else ''
            if sc: per_college[sc][b].add(wid)
            if e[13]<2 and sc and cc: pair_coll[frozenset((sc,cc))].add(wid)
with open(P,'wb') as f:
    pickle.dump({'per_person':dict(per_person),'pair_coll':dict(pair_coll),'per_college':dict(per_college)},f)
print('h2',lo,'-',min(hi,len(files)),'of',len(files))
