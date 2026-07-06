import json,re
from collections import defaultdict
OUT=open('/tmp/qa2/validation_results2.txt','w')
def log(*a):
    print(*a); OUT.write(' '.join(str(x) for x in a)+'\n'); OUT.flush()
def data_of(f):
    with open(f,encoding='utf-8') as fh:
        for line in fh:
            if 'id="data"' in line and len(line)>5000:
                return json.loads(re.search(r'>(.*)$',line).group(1).rstrip().removesuffix('</script>'))
counts=data_of('counts_table.html'); chord=data_of('chord_viz.html'); net=data_of('network_viz.html')

# CHECK 1b: chord vs counts as multisets per anchor+cap
bad=0
for cap in ['all','100','50','20']:
    for k in counts['by_cap'][cap]:
        a=sorted(map(json.dumps,chord['by_cap'][cap].get(k,[])))
        b=sorted(map(json.dumps,counts['by_cap'][cap][k]))
        if a!=b: bad+=1
log('CHECK 1b chord data == counts data (order-insensitive, all caps):','PASS (ties ordered differently only)' if bad==0 else f'FAIL {bad}')

idx=json.load(open('data/details/anchors.json',encoding='utf-8'))
units={a['label']:a for a in idx['anchors'] if a['kind']=='unit'}
kind_of={a['label']:a['unit_type'] for a in idx['anchors'] if a['kind']=='unit'}
key_by_label={a['label']:a['key'] for a in net['anchors'] if a['kind']=='unit'}
kind_from_key=lambda k:k.split('|')[0]  # Department|U|8950 -> anchor picker kind

c2=[0,0]; c3=[0,0]; c5=[0,0]
c2bad=[]; c3bad=[]; c5bad=[]
inst_lower=inst_higher=inst_eq=0; inst_examples=[]
for label,a in sorted(units.items()):
    key=key_by_label.get(label)
    if not key: continue
    p=json.load(open('data/details/'+a['file'],encoding='utf-8'))
    strs=p['strs']
    minrel={}
    for wid,rows in p['rows_by_work'].items():
        for e in rows:
            if e[0]==e[6]: continue
            k2=(wid,e[0],e[6])
            if k2 not in minrel or e[13]<minrel[k2]: minrel[k2]=e[13]
    within=set(); pu=defaultdict(set); pi=defaultdict(set); pairs=defaultdict(set)
    for wid,rows in p['rows_by_work'].items():
        for e in rows:
            if e[0]==e[6]: continue
            mr=minrel[(wid,e[0],e[6])]
            pairs[frozenset((e[0],e[6]))].add(wid)
            if mr==0: within.add(wid)
            elif mr==1 and e[13]==1:
                # partner units restricted to the ANCHOR's unit kind (page/portal convention)
                if e[9]==(0 if a['unit_type']=='Department' else 1 if a['unit_type']=='Program' else 2):
                    cu=strs[e[8]] if e[8] is not None else ''
                    if cu: pu[cu].add(wid)
            elif mr==2 and e[13]==2:
                ci=strs[e[12]] if e[12] is not None else ''
                if ci: pi[ci].add(wid)
    entry=counts['by_cap']['all'].get(key,[])
    page_within=next((r[2] for r in entry if r[1]==0),0)
    ok=page_within==len(within)
    c2[0 if ok else 1]+=1
    if not ok: c2bad.append((label,page_within,len(within)))
    page_partners={r[0]:r[2] for r in entry if r[1]==1}
    sas_partners={k:len(v) for k,v in pu.items()}
    ok=page_partners==sas_partners
    c3[0 if ok else 1]+=1
    if not ok and len(c3bad)<6:
        op=set(page_partners)-set(sas_partners); os_=set(sas_partners)-set(page_partners)
        vd=[(k,page_partners[k],sas_partners[k]) for k in set(page_partners)&set(sas_partners) if page_partners[k]!=sas_partners[k]]
        c3bad.append((label,list(op)[:2],list(os_)[:2],vd[:2]))
    # institutions: quantify direction
    page_inst={r[0]:r[2] for r in entry if r[1]==2}
    for inst,v in page_inst.items():
        sv=len(pi.get(inst,set()))
        if v==sv: inst_eq+=1
        elif v<sv:
            inst_lower+=1
            if len(inst_examples)<3: inst_examples.append((label,inst,v,sv))
        else: inst_higher+=1
    npairs={frozenset((e[0],e[1])):e[2] for e in net['edges_cap']['all'].get(key,[])}
    spairs={k:len(v) for k,v in pairs.items()}
    ok=npairs==spairs
    c5[0 if ok else 1]+=1
    if not ok and len(c5bad)<6:
        extra=set(npairs)-set(spairs); miss=set(spairs)-set(npairs)
        vd=[(sorted(k),npairs[k],spairs[k]) for k in set(npairs)&set(spairs) if npairs[k]!=spairs[k]]
        c5bad.append((label,f'netonly={len(extra)}',f'sasonly={len(miss)}',f'valdiff={len(vd)}',vd[:2]))
log('CHECK 2b counts within-works per anchor: PASS',c2[0],'FAIL',c2[1],c2bad)
log('CHECK 3b counts partner units (same-kind convention): PASS',c3[0],'FAIL',c3[1])
for b in c3bad: log('   ',b)
log('CHECK 4b institution works: equal',inst_eq,'| page lower',inst_lower,'| page higher',inst_higher)
for e in inst_examples: log('    ex page<sas:',e)
log('CHECK 5b network pairs: PASS',c5[0],'FAIL',c5[1])
for b in c5bad: log('   ',b)
OUT.close()
