"""
Prototype: pack ONE anchor's (Physics, 8950) rows from details_base.csv into a
compact work-grain JSON payload, to measure realistic size before deciding the
final architecture (one file per anchor vs all anchors in one file).

Grain kept: (scholar, work, collaborator, scholar-affiliation, collab-affiliation) -
the true SAS explosion - because BOTH sides can have multiple College/Department/
Discipline combos and we don't want to lose that by pre-aggregating to person-level.

Compact encoding: shared string tables (colleges, depts, discs, insts) referenced
by index, so repeated text isn't duplicated across rows.
"""
import csv, json, time
csv.field_size_limit(10**8)

SRC = "/sessions/compassionate-zen-cannon/mnt/collab-mit/sas/details_base.csv"
ANCHOR_UNIT_ID = "8950"  # Physics

IDX = {"InstitutionId":0,"InstitutionName":1,"College":2,"UnitId":3,"Department":4,"UnitType":5,
       "PersonId":6,"PersonName":7,"Broad_Field":8,"Discipline":9,"CollaborationType":10,
       "Collab_InstitutionId":11,"Collab_Institution":12,"Collab_State":13,"Collab_College":14,
       "Collab_UnitId":15,"Collab_Department":16,"Collab_UnitType":17,"Collab_BF":18,"Collab_Disc":19,
       "Collab_PersonID":20,"Collab_PersonName":21,"Year":22,"Collab_ID":23,"Collab_Detail":24,
       "Collab_Title":25,"Rank":26,"Collab_Dir":27,"Relationship":28}

t0 = time.time()
people = {}  # pid -> [name, rank]
works = {}   # wid -> [title, type, year, venue]
rows_for_anchor = []
n_total = 0

with open(SRC, encoding="latin-1", newline="") as f:
    r = csv.reader(f)
    header = next(r)
    for row in r:
        n_total += 1
        if len(row) < 29:
            continue
        if row[IDX["UnitId"]] != ANCHOR_UNIT_ID:
            continue
        rows_for_anchor.append(row)
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

print(f"scanned {n_total:,} rows in {time.time()-t0:.1f}s, {len(rows_for_anchor):,} rows for anchor {ANCHOR_UNIT_ID}")
print(f"distinct people involved: {len(people):,}, distinct works: {len(works):,}")

# build work entries: wid -> list of tuples (scholar side + collab side + relationship)
work_entries = {}
for row in rows_for_anchor:
    wid = row[IDX["Collab_ID"]]
    entry = [
        row[IDX["PersonId"]], row[IDX["College"]], row[IDX["Department"]], row[IDX["UnitType"]], row[IDX["Discipline"]],
        row[IDX["Collab_PersonID"]], row[IDX["Collab_College"]], row[IDX["Collab_Department"]], row[IDX["Collab_UnitType"]],
        row[IDX["Collab_Disc"]], row[IDX["Collab_Institution"]], row[IDX["Relationship"]], row[IDX["Collab_Dir"]],
    ]
    work_entries.setdefault(wid, []).append(entry)

payload = {"people": people, "works": works, "rows_by_work": work_entries}
blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
print(f"payload size for ONE anchor (Physics): {len(blob)/1e6:.2f} MB")
print(f"  people table: {len(json.dumps(people))/1e6:.2f} MB")
print(f"  works table: {len(json.dumps(works))/1e6:.2f} MB")
print(f"  rows_by_work: {len(json.dumps(work_entries))/1e6:.2f} MB")
print(f"  avg rows per work: {sum(len(v) for v in work_entries.values())/max(len(work_entries),1):.1f}")
print(f"  total exploded rows for anchor: {sum(len(v) for v in work_entries.values()):,}")
