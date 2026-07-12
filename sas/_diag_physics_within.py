import csv, pickle, os, time, sys
csv.field_size_limit(10**8)

CKPT = "_diag_physics_within.pkl"
BUDGET = float(os.environ.get("PACK_BUDGET","999999"))
physics_uid = "8950"

if os.path.exists(CKPT):
    with open(CKPT,"rb") as f:
        state = pickle.load(f)
    works_A_members = state["A"]
    works_B = state["B"]
    physics_scholar_ids = state["S"]
    n_done = state["n"]
    byte_off = state["off"]
    header = state.get("header")
    print(f"resume at {n_done:,} rows", flush=True)
else:
    works_A_members = {}
    works_B = set()
    physics_scholar_ids = set()
    n_done = 0
    byte_off = None
    header = None

t0 = time.time()
with open("details_base.csv", encoding="latin-1", newline="") as f:
    header_line = f.readline()
    if header is None:
        header = next(csv.reader([header_line]))
    if byte_off is None:
        byte_off = f.tell()
    f.seek(byte_off)
    idx = {c:i for i,c in enumerate(header)}
    finished = False
    while True:
        line = f.readline()
        if not line:
            finished = True
            break
        row = next(csv.reader([line]))
        byte_off = f.tell()
        if len(row) >= len(header):
            uid = row[idx["UnitId"]]
            ut = row[idx["UnitType"]]
            pid = row[idx["PersonId"]]
            wid = row[idx["Collab_ID"]]
            rel = row[idx["Relationship"]]
            if uid == physics_uid and ut in ("Department","Medical","Clinical"):
                physics_scholar_ids.add(pid)
                works_A_members.setdefault(wid, set()).add(pid)
                if rel == "Within Unit":
                    works_B.add(wid)
        n_done += 1
        if time.time()-t0 > BUDGET:
            break

if not finished:
    with open(CKPT,"wb") as f:
        pickle.dump({"A":works_A_members,"B":works_B,"S":physics_scholar_ids,"n":n_done,"off":byte_off,"header":header}, f, protocol=4)
    print(f"checkpointed at {n_done:,} rows ({time.time()-t0:.1f}s)", flush=True)
else:
    print("rows scanned:", n_done)
    print("distinct Physics scholar ids seen:", len(physics_scholar_ids))
    A = {wid for wid, s in works_A_members.items() if len(s) >= 2}
    print("def A (m>=2 on UnitId 8950 specifically): works =", len(A))
    print("def B (any Physics-focal row w/ Relationship=Within Unit): works =", len(works_B))
    print("A - B:", len(A - works_B))
    print("B - A:", len(works_B - A))
    if os.path.exists(CKPT):
        try: os.remove(CKPT)
        except Exception as e: print("cleanup failed", e)
