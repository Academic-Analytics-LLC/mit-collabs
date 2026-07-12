import sys, pickle, json, time, os
sys.path.insert(0,'.')
import build_intl_table as m
sys.modules['__main__'].AnchorBucket = m.AnchorBucket

TIME_BUDGET = float(os.environ.get("CONV_BUDGET", "30"))
t0 = time.time()

with open('build_intl_table.checkpoint.pkl','rb') as f:
    state = pickle.load(f)
print('load took', time.time()-t0, flush=True)

def college_key(college):
    return 'C' + ''.join(c if c.isalnum() else '_' for c in college)[:40]

def dump_bucket(bucket, path):
    strs = bucket.strtab
    inv = [None]*len(strs)
    for s,i in strs.items(): inv[i]=s
    people = bucket.people
    works = bucket.works
    tmp = path + '.tmp'
    with open(tmp,'w',encoding='utf-8') as o:
        for doi, arr in bucket.rows_by_work.items():
            wk = works.get(doi, ['','','','',''])
            for e in arr:
                pid = e[0]
                pname = people.get(pid, pid)
                college = inv[e[1]] if e[1] is not None else ''
                unit = inv[e[2]] if e[2] is not None else ''
                ut = e[3]
                instid = inv[e[4]] if e[4] is not None else ''
                instname = inv[e[5]] if e[5] is not None else ''
                country = inv[e[6]] if e[6] is not None else ''
                naics = inv[e[7]] if e[7] is not None else ''
                o.write(json.dumps([pid,pname,college,unit,ut,doi,wk[0],wk[1],wk[2],wk[3],wk[4],instid,instname,country,naics], ensure_ascii=False)+'\n')
    os.replace(tmp, path)

n = 0
skipped = 0
for uid, bucket in state['units'].items():
    path = f'intl/raw/U{uid}.jsonl'
    if os.path.exists(path):
        skipped += 1
    else:
        dump_bucket(bucket, path)
        n += 1
    if time.time() - t0 > TIME_BUDGET:
        print(f'units: wrote {n}, skipped {skipped} (time budget hit)', flush=True)
        sys.exit(0)

for college, bucket in state['colleges'].items():
    path = f'intl/raw/{college_key(college)}.jsonl'
    if os.path.exists(path):
        skipped += 1
    else:
        dump_bucket(bucket, path)
        n += 1
    if time.time() - t0 > TIME_BUDGET:
        print(f'units+colleges: wrote {n}, skipped {skipped} (time budget hit, colleges in progress)', flush=True)
        sys.exit(0)

# all done - save the scan resume state
with open('intl_scan_state.json','w') as f:
    json.dump({'byte_off': state['byte_off'], 'n_done': state['n_done'],
               'unit_labels': state['unit_labels'],
               'college_keys': {c: college_key(c) for c in state['colleges']}}, f)
print(f'ALL DONE. wrote {n}, skipped {skipped}. saved intl_scan_state.json: n_done={state["n_done"]} byte_off={state["byte_off"]}')
print('total time', time.time()-t0)
