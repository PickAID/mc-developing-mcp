#!/usr/bin/env python3
"""Fetch third-party library sources and place them for indexing.

Reads library configs from third_party_registry.json, clones repos at the
specified branch/tag, extracts Java source files, and places them under
sources/{mc_version}/{library_name}/sources/.

Usage:
    python scripts/fetch_third_party.py                    # fetch all
    python scripts/fetch_third_party.py --library geckolib  # single lib
    python scripts/fetch_third_party.py --version 1.20.1   # single MC version
    python scripts/fetch_third_party.py --dry-run           # show plan only
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_ROOT = ROOT / "sources"
REGISTRY_FILE = Path(__file__).resolve().parent / "third_party_registry.json"


def load_registry() -> list[dict]:
    with REGISTRY_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("libraries", [])


def find_java_source_dirs(repo_dir: Path) -> list[Path]:
    """Auto-detect Java source directories in a cloned repo."""
    candidates: list[Path] = []
    # Look for src/main/java at any depth (max 3 levels)
    for pattern in [
        "src/main/java",
        "*/src/main/java",
        "*/src/main/java",
    ]:
        for d in repo_dir.glob(pattern):
            if d.is_dir() and any(d.rglob("*.java")):
                candidates.append(d)
    # Deduplicate
    seen: set[str] = set()
    unique: list[Path] = []
    for c in candidates:
        key = str(c.resolve())
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def clone_repo(repo: str, ref: str, dest: Path) -> bool:
    """Shallow clone a GitHub repo at the given ref."""
    url = f"https://github.com/{repo}.git"
    cmd = [
        "git", "clone", "--depth", "1", "--branch", ref,
        "--single-branch", "--quiet", url, str(dest),
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
            env={
                **__import__("os").environ,
                "GIT_TERMINAL_PROMPT": "0",
                "GCM_INTERACTIVE": "never",
            },
        )
        if result.returncode != 0:
            print(f"    ERROR: git clone failed: {result.stderr.strip()[:200]}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print(f"    ERROR: git clone timed out after 300s")
        return False
    except FileNotFoundError:
        print(f"    ERROR: git not found")
        return False


def copy_java_sources(
    source_dirs: list[Path],
    dest_root: Path,
) -> int:
    """Copy all .java files from source dirs to dest, preserving package structure."""
    count = 0
    for src_dir in source_dirs:
        for java_file in src_dir.rglob("*.java"):
            rel = java_file.relative_to(src_dir)
            target = dest_root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(java_file, target)
            count += 1
    return count


def fetch_library(
    lib: dict,
    filter_version: str | None,
    dry_run: bool,
) -> dict[str, int]:
    """Fetch one library for all configured MC versions."""
    name = lib["name"]
    repo = lib["repo"]
    versions = lib.get("versions", {})
    stats: dict[str, int] = {}

    for mc_ver, ver_config in versions.items():
        if filter_version and mc_ver != filter_version:
            continue

        ref = ver_config["ref"]
        source_dir_specs = ver_config.get("source_dirs", ["auto"])
        dest = SOURCES_ROOT / mc_ver / name / "sources"

        print(f"  {name}/{mc_ver} (ref={ref})")

        if dry_run:
            print(f"    → {dest}")
            stats[mc_ver] = 0
            continue

        # Skip if already fetched and has content
        if dest.exists() and any(dest.rglob("*.java")):
            existing_count = sum(1 for _ in dest.rglob("*.java"))
            print(f"    SKIP: already exists with {existing_count} Java files")
            stats[mc_ver] = existing_count
            continue

        # Clone to temp dir
        with tempfile.TemporaryDirectory(prefix=f"mc-{name}-") as tmpdir:
            tmp_path = Path(tmpdir) / "repo"
            if not clone_repo(repo, ref, tmp_path):
                stats[mc_ver] = -1
                continue

            # Resolve source directories
            if source_dir_specs == ["auto"]:
                java_dirs = find_java_source_dirs(tmp_path)
                if not java_dirs:
                    print(f"    WARN: no Java sources found (auto-detect)")
                    stats[mc_ver] = 0
                    continue
                print(f"    auto-detected {len(java_dirs)} source dirs: {[str(d.relative_to(tmp_path)) for d in java_dirs]}")
            else:
                java_dirs = []
                for spec in source_dir_specs:
                    d = tmp_path / spec
                    if d.is_dir():
                        java_dirs.append(d)
                    else:
                        print(f"    WARN: source dir not found: {spec}")

            if not java_dirs:
                print(f"    WARN: no valid source directories")
                stats[mc_ver] = 0
                continue

            # Clean dest and copy
            if dest.exists():
                shutil.rmtree(dest)
            dest.mkdir(parents=True, exist_ok=True)

            count = copy_java_sources(java_dirs, dest)
            print(f"    OK: {count} Java files → {dest.relative_to(ROOT)}")
            stats[mc_ver] = count

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch third-party library sources")
    parser.add_argument("--library", help="Fetch only this library")
    parser.add_argument("--version", help="Fetch only for this MC version")
    parser.add_argument("--dry-run", action="store_true", help="Show plan only")
    args = parser.parse_args()

    libraries = load_registry()
    if args.library:
        libraries = [lib for lib in libraries if lib["name"] == args.library]
        if not libraries:
            print(f"Library '{args.library}' not found in registry")
            return 1

    print(f"Fetching {len(libraries)} libraries")
    if args.dry_run:
        print("(DRY RUN)")
    print()

    total_files = 0
    total_errors = 0
    for lib in libraries:
        stats = fetch_library(lib, args.version, args.dry_run)
        for mc_ver, count in stats.items():
            if count < 0:
                total_errors += 1
            else:
                total_files += count

    print(f"\nDone: {total_files} Java files fetched, {total_errors} errors")
    return 1 if total_errors > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
