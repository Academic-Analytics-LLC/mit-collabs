import csv, json, time
csv.field_size_limit(10**8)

IDX = {"InstitutionId":0,"InstitutionName":1,"College":2,"UnitId":3,"Department":4,"UnitType":5,
       "PersonId":6,"PersonName":7,"Broad_Field":8,"Discipline":9,"CollaborationType":10,
       "Collab_InstitutionId":11,"Collab_Institution":12,"Collab_State":13,"Collab_College":14,
       "Collab_UnitId":15,"Collab_Department":16,"Collab_UnitType":17,"Collab_BF":18,"Collab_Disc":19,
       "Collab_PersonID":20,"Collab_PersonName":21,"Year":22,"Collab_ID":23,"Collab_Detail":24,
       "Collab_Title":25,"Rank":26,"Collab_Dir":27,"Relationship":28}

t0 = time.time()
people = {}
works = {}
work_entries = {}
n = 0
with open("_physics_rows.csv", encoding="utf-8", newline="") as f:
    r = csv.reader(f)
    next(r)
    for row in r:
        n += 1
        pid = row[IDX["PersonId"]]
        if pid not in people:
            people[pid] = [row[IDX["PersonName"]], row[IDX["Rank"]]]
        cpid = row[IDX["Collab_PersonID"]]
        if cpid not in people:
            people[cpid] = [row[IDX["Collab_PersonName"]], ""]
        wid = row[IDX["Collab_ID"]]
        if wid not in works:
            works[wid] = [row[IDX["Collab_Title"]][:200], row[IDX["CollaborationType"]],
                          row[IDX["Year"]], row[IDX["Collab_Detail"]][:100]]
        entry = [
            pid, row[IDX["College"]], row[IDX["Department"]], row[IDX["UnitType"]], row[IDX["Discipline"]],
            cpid, row[IDX["Collab_College"]], row[IDX["Collab_Department"]], row[IDX["Collab_UnitType"]],
            row[IDX["Collab_Disc"]], row[IDX["Collab_Institution"]], row[IDX["Relationship"]], row[IDX["Collab_Dir"]],
        ]
        work_entries.setdefault(wid, []).append(entry)

print(f"rows={n} people={len(people)} works={len(works)} elapsed={time.time()-t0:.1f}s")
payload = {"people": people, "works": works, "rows_by_work": work_entries}
blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
print(f"TOTAL payload for Physics anchor: {len(blob)/1e6:.2f} MB")
print(f"  people table: {len(json.dumps(people, ensure_ascii=False))/1e6:.2f} MB")
print(f"  works table: {len(json.dumps(works, ensure_ascii=False))/1e6:.2f} MB")
print(f"  rows_by_work: {len(json.dumps(work_entries, ensure_ascii=False))/1e6:.2f} MB")
tot_exploded = sum(len(v) for v in work_entries.values())
print(f"  avg rows/work: {tot_exploded/max(len(work_entries),1):.1f}  total exploded rows: {tot_exploded}")
with open("_physics_payload.json", "w", encoding="utf-8") as o:
    o.write(blob)
