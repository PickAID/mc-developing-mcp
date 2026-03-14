#!/usr/bin/env python3
"""Database management utility for the Minecraft MCP system.

Provides status reporting and rebuild commands for the source and docs databases.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC_DB = DATA / "minecraft_sources.sqlite"
DOCS_DB = DATA / "minecraft_docs.sqlite"


def _run(cmd: str) -> None:
    p = subprocess.run(cmd, shell=True, cwd=str(ROOT))
    if p.returncode != 0:
        raise SystemExit(p.returncode)


def _status() -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "source_db": {"exists": SRC_DB.exists(), "path": str(SRC_DB)},
        "docs_db": {"exists": DOCS_DB.exists(), "path": str(DOCS_DB)},
    }

    if SRC_DB.exists():
        conn = sqlite3.connect(str(SRC_DB))
        try:
            out["source_db"]["size_mb"] = round(SRC_DB.stat().st_size / 1048576, 1)
            out["source_db"]["files"] = conn.execute("SELECT COUNT(*) FROM source_files").fetchone()[0]
            out["source_db"]["classes"] = conn.execute("SELECT COUNT(*) FROM source_classes").fetchone()[0]
            out["source_db"]["methods"] = conn.execute("SELECT COUNT(*) FROM source_methods").fetchone()[0]
            out["source_db"]["fields"] = conn.execute("SELECT COUNT(*) FROM source_fields").fetchone()[0]
            out["source_db"]["events"] = conn.execute("SELECT COUNT(*) FROM source_events").fetchone()[0]
            rows = conn.execute(
                "SELECT version, loader, COUNT(*) FROM source_files GROUP BY version, loader ORDER BY version, loader"
            ).fetchall()
            out["source_db"]["by_version_loader"] = [
                {"version": r[0], "loader": r[1], "files": r[2]} for r in rows
            ]
        finally:
            conn.close()

    if DOCS_DB.exists():
        conn = sqlite3.connect(str(DOCS_DB))
        try:
            out["docs_db"]["size_mb"] = round(DOCS_DB.stat().st_size / 1048576, 1)
            out["docs_db"]["pages"] = conn.execute("SELECT COUNT(*) FROM doc_pages").fetchone()[0]
            rows = conn.execute(
                "SELECT library, version, COUNT(*) FROM doc_pages GROUP BY library, version ORDER BY library, version"
            ).fetchall()
            out["docs_db"]["by_library"] = [
                {"library": r[0], "version": r[1], "pages": r[2]} for r in rows
            ]
        finally:
            conn.close()

    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Minecraft MCP database management")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_status = sub.add_parser("status", help="Show database status")
    p_status.add_argument("--json", action="store_true", help="Output as JSON")

    p_rebuild = sub.add_parser("rebuild", help="Rebuild databases")
    p_rebuild.add_argument("--sources", action="store_true", help="Rebuild source index")
    p_rebuild.add_argument("--docs", action="store_true", help="Re-fetch documentation")
    p_rebuild.add_argument("--all", action="store_true", help="Rebuild everything")

    args = parser.parse_args()

    if args.cmd == "status":
        info = _status()
        if args.json:
            print(json.dumps(info, indent=2))
            return 0
        src = info["source_db"]
        print(f"Source DB: {'exists' if src['exists'] else 'MISSING'} ({src.get('size_mb', 0)} MB)")
        if src.get("exists"):
            print(f"  files={src.get('files', 0)} classes={src.get('classes', 0)} "
                  f"methods={src.get('methods', 0)} fields={src.get('fields', 0)} "
                  f"events={src.get('events', 0)}")
        docs = info["docs_db"]
        print(f"Docs DB:   {'exists' if docs['exists'] else 'MISSING'} ({docs.get('size_mb', 0)} MB)")
        if docs.get("exists"):
            print(f"  pages={docs.get('pages', 0)}")
        return 0

    if args.cmd == "rebuild":
        do_all = args.all or (not args.sources and not args.docs)
        if do_all or args.sources:
            _run("python3 scripts/index_sources.py --rebuild")
        if do_all or args.docs:
            _run("python3 scripts/fetch_docs.py")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
