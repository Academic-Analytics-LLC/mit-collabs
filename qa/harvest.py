import json,sys,pickle,os
from collections import defaultdict
lo,hi=int(sys.argv[1]),int(sys.argv[2])
idx=json.load(open('data/details/anchors.json',encoding='utf-8'))
files=[(a['label'],a['unit_type'],a['file']) for a in idx['anchors'] if a['kind']=='unit']
files.sort()
state={'per_entity':{},'per_college':defaultdict(lambda:[set(),set(),set()]),
       'person_deg':defaultdict(set),'sas_wids':set(),
       'pair_units':{'Department':defaultdict(set),'Program':defaultdict(set)},
       'pair_coll':defaultdict(set)}
P='/tmp/qa2/state.pkl'
if os.path.exists(P):
    with open(P,'rb') as f: raw=pickle.load(f)
    state['per_entity']=raw['per_entity']
    state['per_college']=defaultdict(lambda:[set(),set(),set()],raw['per_college'])
    state['person_deg']=defaultdict(set,raw['person_deg'])
    state['sas_wids']=raw['sas_wids']
    state['pair_units']={m:defaultdict(set,raw['pair_units'][m]) for m in raw['pair_units']}
    state['pair_coll']=defaultdict(set,raw['pair_coll'])
for label,ut,fn in files[lo:hi]:
    p=json.load(open('data/details/'+fn,encoding='utf-8'))
    strs=p['strs']
    state['sas_wids'].update(p['works'].keys())
    minrel={}
    for wid,rows in p['rows_by_work'].items():
        for e in rows:
            if e[0]==e[6]: continue
            k=(wid,e[0],e[6])
            if k not in minrel or e[13]<minrel[k]: minrel[k]=e[13]
    ent=[set(),set(),set()]
    for wid,rows in p['rows_by_work'].items():
        for e in rows:
            if e[0]==e[6]: continue
            mr=minrel[(wid,e[0],e[6])]
            b=0 if mr==0 else 1 if mr==1 else 2
            ent[b].add(wid)
            state['person_deg'][e[0]].add(e[6])
            sc=strs[e[1]] if e[1] is not None else ''
            if sc: state['per_college'][sc][b].add(wid)
            if e[13]<2:
                su=strs[e[2]] if e[2] is not None else ''
                cu=strs[e[8]] if e[8] is not None else ''
                cc=strs[e[7]] if e[7] is not None else ''
                if su and cu and ut in ('Department','Program') and e[9]==(0 if ut=='Department' else 1) and e[3]==e[9]:
                    state['pair_units'][ut][frozenset((su,cu))].add(wid)
                if sc and cc: state['pair_coll'][frozenset((sc,cc))].add(wid)
    state['per_entity'][label]=ent
with open(P,'wb') as f:
    pickle.dump({'per_entity':state['per_entity'],'per_college':dict(state['per_college']),
                 'person_deg':dict(state['person_deg']),'sas_wids':state['sas_wids'],
                 'pair_units':{m:dict(v) for m,v in state['pair_units'].items()},
                 'pair_coll':dict(state['pair_coll'])},f)
print('harvested',lo,'to',min(hi,len(files)),'of',len(files),'| state size',os.path.getsize(P))
