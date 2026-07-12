import csv, pickle, os, time
csv.field_size_limit(10**8)

CKPT = "_diag2.pkl"
BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))
PHYSICS_UID = "8950"

if os.path.exists(CKPT):
    with open(CKPT, "rb") as f:
        state = pickle.load(f)
    print(f"resume at {state['n']:,} rows", flush=True)
else:
    state = {"A": {}, "B": set(), "S": set(), "n": 0, "off": None}

t0 = time.time()
with open("details_base.csv", encoding="latin-1", newline="") as f:
    header = next(csv.reader([f.readline()]))
    idx = {c: i for i, c in enumerate(header)}
    if state["off"] is None:
        state["off"] = f.tell()
    f.seek(state["off"])

    finished = False
    while True:
        line = f.readline()
        if not line:
            finished = True
            break
        row = next(csv.reader([line]))
        state["off"] = f.tell()
        if len(row) >= len(header):
            uid = row[idx["UnitId"]]
            ut = row[idx["UnitType"]]
            pid = row[idx["PersonId"]]
            wid = row[idx["Collab_ID"]]
            rel = row[idx["Relationship"]]
            if uid == PHYSICS_UID and ut in ("Department", "Medical", "Clinical"):
                state["S"].add(pid)
                state["A"].setdefault(wid, set()).add(pid)
                if rel == "Within Unit":
                    state["B"].add(wid)
        state["n"] += 1
        if time.time() - t0 > BUDGET:
            break

if not finished:
    with open(CKPT, "wb") as f:
        pickle.dump(state, f, protocol=4)
    print(f"checkpointed at {state['n']:,} rows ({time.time()-t0:.1f}s)", flush=True)
else:
    print("rows scanned:", state["n"])
    print("distinct Physics scholar ids seen:", len(state["S"]))
    A = {wid for wid, s in state["A"].items() if len(s) >= 2}
    print("def A (m>=2 on UnitId 8950 specifically): works =", len(A))
    print("def B (any Physics-focal row w/ Relationship=Within Unit): works =", len(state["B"]))
    print("A - B:", len(A - state["B"]))
    print("B - A:", len(state["B"] - A))
