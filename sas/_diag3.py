import csv, pickle, os, time
csv.field_size_limit(10**8)
CKPT = "_diag3.pkl"
BUDGET = float(os.environ.get("PACK_BUDGET", "999999"))
DEPT_TYPES = {"Department", "Medical", "Clinical"}

if os.path.exists(CKPT):
    with open(CKPT, "rb") as f:
        state = pickle.load(f)
    print(f"resume at {state['n']:,} rows", flush=True)
else:
    state = {"pid_units": {}, "n": 0, "off": None}  # pid -> set of (uid,dept) dept-type units

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
            ut = row[idx["UnitType"]]
            if ut in DEPT_TYPES:
                pid = row[idx["PersonId"]]
                uid = row[idx["UnitId"]]
                dept = row[idx["Department"]]
                state["pid_units"].setdefault(pid, set()).add((uid, dept))
        state["n"] += 1
        if time.time() - t0 > BUDGET:
            break

if not finished:
    with open(CKPT, "wb") as f:
        pickle.dump(state, f, protocol=4)
    print(f"checkpointed at {state['n']:,} rows ({time.time()-t0:.1f}s)", flush=True)
else:
    print("rows scanned:", state["n"])
    physics_pids = {pid for pid, units in state["pid_units"].items() if any(u[0] == "8950" for u in units)}
    print("Physics-affiliated (dept-type) scholars:", len(physics_pids))
    multi = {pid: state["pid_units"][pid] for pid in physics_pids if len(state["pid_units"][pid]) > 1}
    print("of those, multi-department-type-affiliated:", len(multi))
    for pid, units in list(multi.items())[:15]:
        print(" ", pid, units)
