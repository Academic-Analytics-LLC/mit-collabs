import csv, json, time
csv.field_size_limit(10**8)

t0 = time.time()
people = {}
works = {}
work_entries = {}
strtab = {}  # string -> index, shared across college/dept/disc/inst
def sidx(s):
    if s not in strtab:
        strtab[s] = len(strtab)
    return strtab[s]

UT_CODE = {"Department":0, "Program":1, "Medical":2, "Clinical":3}
REL_CODE = {"Within Unit":0, "Across Units":1, "Across Institutions":2}
DIR_CODE = {"Internal":0, "External":1}

n = 0
with open("_physics_rows.csv", encoding="utf-8", newline="") as f:
    r = csv.reader(f)
    header = next(r); idx = {c:i for i,c in enumerate(header)}
    for row in r:
        n += 1
        pid = row[idx["PersonId"]]
        if pid not in people:
            people[pid] = [row[idx["PersonName"]], row[idx["Rank"]]]
        cpid = row[idx["Collab_PersonID"]]
        if cpid not in people:
            people[cpid] = [row[idx["Collab_PersonName"]], ""]
        wid = row[idx["Collab_ID"]]
        if wid not in works:
            works[wid] = [row[idx["Collab_Title"]][:200], row[idx["CollaborationType"]],
                          row[idx["Year"]], row[idx["Collab_Detail"]][:100]]
        entry = [
            pid, sidx(row[idx["College"]]), sidx(row[idx["Department"]]), UT_CODE.get(row[idx["UnitType"]],0), sidx(row[idx["Discipline"]]),
            cpid, sidx(row[idx["Collab_College"]]), sidx(row[idx["Collab_Department"]]), UT_CODE.get(row[idx["Collab_UnitType"]],0),
            sidx(row[idx["Collab_Disc"]]), sidx(row[idx["Collab_Institution"]]),
            REL_CODE.get(row[idx["Relationship"]],1), DIR_CODE.get(row[idx["Collab_Dir"]],1),
        ]
        work_entries.setdefault(wid, []).append(entry)

strs = [None]*len(strtab)
for s,i in strtab.items(): strs[i] = s

payload = {"strs": strs, "people": people, "works": works, "rows_by_work": work_entries}
blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
print(f"rows={n} people={len(people)} works={len(works)} distinct_strings={len(strs)} elapsed={time.time()-t0:.1f}s")
print(f"TOTAL compact payload: {len(blob)/1e6:.2f} MB")
print(f"  strs table: {len(json.dumps(strs, ensure_ascii=False))/1e6:.3f} MB")
print(f"  people table: {len(json.dumps(people, ensure_ascii=False))/1e6:.3f} MB")
print(f"  works table: {len(json.dumps(works, ensure_ascii=False))/1e6:.3f} MB")
print(f"  rows_by_work: {len(json.dumps(work_entries, ensure_ascii=False))/1e6:.2f} MB")
with open("_physics_payload_compact.json", "w", encoding="utf-8") as o:
    o.write(blob)
