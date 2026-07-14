"""Split the preserved v2 network data into runtime payloads.

The recovered network UI was lost, but its embedded data block is intact. This
script extracts that block once and writes a compact index plus one payload per
anchor so the rebuilt page does not parse a 30 MB HTML document on every load.

Usage:
    python sas/build_network_payloads.py [source_html]
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCES = (
    ROOT / "network_viz_backup_2026-07-09_pre-features.html",
    ROOT / "network_viz_backup_2026-07-09.html",
    ROOT / "network_viz_backup_2026-07-08.html",
)
OUT_DIR = ROOT / "data" / "network"


def extract_data(source: Path) -> dict:
    text = source.read_text(encoding="utf-8")
    match = re.search(
        r'<script\s+id=["\']data["\'][^>]*>(.*?)</script>',
        text,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"No embedded network data block found in {source}")
    return json.loads(match.group(1))


def payload_name(key: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9]+", "_", key).strip("_")[:72]
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
    return f"{stem}_{digest}.json"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def main() -> None:
    if len(sys.argv) > 1:
        source = Path(sys.argv[1]).resolve()
    else:
        source = next((candidate for candidate in DEFAULT_SOURCES if candidate.exists()), None)
        if source is None:
            choices = ", ".join(str(candidate) for candidate in DEFAULT_SOURCES)
            raise FileNotFoundError(
                f"No preserved network source found. Pass source_html or restore one of: {choices}"
            )
    data = extract_data(source)

    anchors = []
    for anchor in data["anchors"]:
        key = anchor["key"]
        filename = payload_name(key)
        anchors.append({**anchor, "payload": f"anchors/{filename}"})
        write_json(
            OUT_DIR / "anchors" / filename,
            {
                "key": key,
                "edges_cap": {
                    cap: data.get("edges_cap", {}).get(cap, {}).get(key, [])
                    for cap in ("20", "50", "100", "all")
                },
                "edge_wids": data.get("edge_wids", {}).get(key, {}),
            },
        )

    anchor_pids = data.get("anchor_pids", {})
    scholar_pids = sorted({pid for pids in anchor_pids.values() for pid in pids})
    index = {
        "version": 1,
        "project": "AAD2024-2904",
        "source_note": (
            "Preserved v2 person-pair data. Physics pair-edge checks were validated "
            "against the authoritative SAS extract; full SAS migration remains separate."
        ),
        "anchors": anchors,
        "people": data.get("people", {}),
        "scholar_pids": scholar_pids,
        "anchor_pids": anchor_pids,
        "unit_edges": data.get("unit_edges", {}),
        "dept_graph": data.get("dept_graph", {"nodes": [], "edges": []}),
        "school_graph": data.get("school_graph", {"nodes": [], "edges": []}),
        "caps": ["20", "50", "100", "all"],
    }

    write_json(OUT_DIR / "index.json", index)
    write_json(OUT_DIR / "works_meta.json", data.get("works_meta", {}))

    print(
        f"wrote {len(anchors)} anchor payloads, {len(data.get('people', {})):,} people, "
        f"and {len(data.get('works_meta', {})):,} works to {OUT_DIR}"
    )


if __name__ == "__main__":
    main()
