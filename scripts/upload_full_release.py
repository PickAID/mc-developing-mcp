#!/usr/bin/env python3
"""
upload_full_release.py — Build and upload the full release package.

Run this locally on the machine that has data/minecraft_sources.sqlite.
GitHub Actions only creates the lite zip (no sources DB); this script
adds the full zip and sources database to an existing release.

What is NEVER included in any release:
    sources/    — raw Java source files (used only to build the DB, 1.3 GB+)

What is included in the FULL zip:
    mcp_server/         code
    scripts/            utilities
    docs/               reference docs and plans
    references/         pre-chunked RAG JSONs
    SKILL.md            AI query rules
    README.md           bilingual readme
    .github/            English readme + workflow
    config.json
    version.json
    requirements.txt
    data/minecraft_docs.sqlite      (~16 MB)
    data/minecraft_sources.sqlite   (~1.2 GB)

Requirements:
    - data/minecraft_sources.sqlite must exist locally
    - GitHub CLI (gh) must be installed and authenticated
    - Run from the Mc-Skill/ root directory (or any path — script auto-locates root)

Usage:
    python scripts/upload_full_release.py [--tag v1.0.0] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Directories that must NEVER appear in any release
BLOCKED_DIRS  = {"sources", ".git", "__pycache__", "reports"}
# File extensions to skip
BLOCKED_EXTS  = {".pyc", ".pyo", ".sqlite-wal", ".sqlite-shm"}
# Specific filenames to skip
BLOCKED_NAMES = {".DS_Store"}


def _vacuum_db(path: Path) -> None:
    print(f"  Checkpointing {path.name}...")
    try:
        conn = sqlite3.connect(str(path))
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
        print(f"  {path.name}: {path.stat().st_size / 1024 / 1024:.0f} MB")
    except Exception as e:
        print(f"  Warning: could not checkpoint {path.name}: {e}")


def _build_zip(zip_path: Path, include_sources: bool) -> int:
    """Build release zip. Returns file count."""
    sources_db  = ROOT / "data" / "minecraft_sources.sqlite"
    blocked_files: set[str] = set()

    if not include_sources:
        blocked_files.add("data/minecraft_sources.sqlite")

    total = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            rel     = path.relative_to(ROOT)
            rel_str = str(rel)

            if rel.parts[0] in BLOCKED_DIRS:        continue
            if rel.suffix == ".zip":                 continue
            if rel.suffix in BLOCKED_EXTS:           continue
            if rel.name   in BLOCKED_NAMES:          continue
            if rel_str    in blocked_files:          continue
            if "__pycache__" in rel.parts:           continue

            size_mb = path.stat().st_size / 1024 / 1024
            label   = f" ({size_mb:.0f} MB)" if size_mb > 1 else ""
            print(f"  + {rel_str}{label}")
            zf.write(path, rel_str)
            total += 1

    return total


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--tag",
        help="Release tag to upload to (e.g. v1.0.0). Defaults to version in version.json.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build the zip but do not upload to GitHub.",
    )
    args = parser.parse_args()

    # ── Determine tag ──────────────────────────────────────────────────────────
    if args.tag:
        tag = args.tag
    else:
        version_file = ROOT / "version.json"
        if not version_file.exists():
            print("Error: version.json not found. Use --tag to specify the release tag.")
            return 1
        version = json.loads(version_file.read_text())["version"]
        tag = f"v{version}"

    print(f"Target release: {tag}")

    # ── Check sources database ────────────────────────────────────────────────
    sources_db = ROOT / "data" / "minecraft_sources.sqlite"
    docs_db    = ROOT / "data" / "minecraft_docs.sqlite"

    if not sources_db.exists():
        print(f"\nError: {sources_db} not found.")
        print("The sources database must exist locally to create a full release.")
        print("Either rebuild it with 'python scripts/index_sources.py'")
        print("or download a previous release: 'python scripts/download_release.py'")
        return 1

    # ── VACUUM databases ──────────────────────────────────────────────────────
    print("\nCheckpointing databases...")
    _vacuum_db(sources_db)
    if docs_db.exists():
        _vacuum_db(docs_db)

    # ── Build full zip ────────────────────────────────────────────────────────
    zip_name = ROOT / f"mc-developing-mcp-full-{tag}.zip"
    print(f"\nBuilding {zip_name.name}...")
    print("(sources/ directory is NEVER included — only the pre-built SQLite DB)")
    print()

    count = _build_zip(zip_name, include_sources=True)
    size_mb = zip_name.stat().st_size / 1024 / 1024
    print(f"\nZip: {zip_name.name} — {count} files, {size_mb:.0f} MB")

    if args.dry_run:
        print("\n[dry-run] Skipping GitHub upload.")
        return 0

    # ── Upload to GitHub Release ───────────────────────────────────────────────
    print(f"\nUploading to GitHub Release {tag}...")

    assets = [str(zip_name), str(sources_db)]
    if docs_db.exists():
        assets.append(str(docs_db))

    result = subprocess.run(
        ["gh", "release", "upload", tag, *assets, "--clobber"],
        cwd=ROOT,
    )

    # Clean up local zip regardless of upload result
    if zip_name.exists():
        zip_name.unlink()
        print(f"(removed local {zip_name.name})")

    if result.returncode != 0:
        print("\nError: 'gh release upload' failed.")
        print("Make sure 'gh' is installed and you are authenticated: gh auth login")
        return 1

    repo = "PickAID/mc-developing-mcp"
    print(f"\nDone. Full release assets uploaded:")
    print(f"  https://github.com/{repo}/releases/tag/{tag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
