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
    - One upload method must be available:
      1) GitHub CLI (gh) installed and authenticated, or
      2) GITHUB_TOKEN/GH_TOKEN env var with repo write permission
    - Run from the Mc-Skill/ root directory (or any path — script auto-locates root)

Usage:
    python scripts/upload_full_release.py [--tag v1.0.0] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Directories that must NEVER appear in any release
BLOCKED_DIRS  = {"sources", ".git", "__pycache__", "reports"}
# File extensions to skip
BLOCKED_EXTS  = {".pyc", ".pyo", ".sqlite-wal", ".sqlite-shm"}
# Specific filenames to skip
BLOCKED_NAMES = {".DS_Store"}
DEFAULT_REPO = "PickAID/mc-developing-mcp"


def _gh_api_json(url: str, token: str, method: str = "GET") -> dict:
    req = urllib.request.Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "mc-developing-mcp-release-uploader",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if not data:
        return {}
    return json.loads(data.decode("utf-8"))


def _upload_with_github_api(tag: str, assets: list[Path]) -> int:
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN or GH_TOKEN is required when gh CLI is unavailable.")
        return 1

    repo = os.getenv("GITHUB_REPOSITORY", DEFAULT_REPO)
    release_url = f"https://api.github.com/repos/{repo}/releases/tags/{tag}"

    try:
        release = _gh_api_json(release_url, token)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"Error: could not read release {tag} in {repo}: HTTP {e.code}")
        print(body)
        return 1

    upload_url_template = release.get("upload_url", "")
    upload_url = upload_url_template.split("{")[0]
    if not upload_url:
        print("Error: release upload_url missing from GitHub API response.")
        return 1

    existing_assets = {a.get("name"): a.get("id") for a in release.get("assets", [])}

    for asset in assets:
        name = asset.name
        asset_id = existing_assets.get(name)
        if asset_id:
            delete_url = f"https://api.github.com/repos/{repo}/releases/assets/{asset_id}"
            try:
                _gh_api_json(delete_url, token, method="DELETE")
                print(f"  deleted existing asset: {name}")
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                print(f"Error deleting existing asset {name}: HTTP {e.code}")
                print(body)
                return 1

        target = f"{upload_url}?name={urllib.parse.quote(name)}"
        data = asset.read_bytes()
        req = urllib.request.Request(
            target,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "mc-developing-mcp-release-uploader",
                "Content-Type": "application/octet-stream",
                "Content-Length": str(len(data)),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=600):
                print(f"  uploaded: {name}")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print(f"Error uploading {name}: HTTP {e.code}")
            print(body)
            return 1

    print(f"Upload complete via GitHub API: https://github.com/{repo}/releases/tag/{tag}")
    return 0


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


def _read_release_version(version_file: Path) -> str:
    raw = version_file.read_text(encoding="utf-8").strip()
    if not raw:
        return ""
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
        except Exception:
            return ""
        return str(data.get("version", "")).strip()
    return raw


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
        version = _read_release_version(version_file)
        if not version:
            print("Error: version.json is empty or invalid. Use --tag to specify the release tag.")
            return 1
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

    assets = [zip_name, sources_db]
    if docs_db.exists():
        assets.append(docs_db)

    gh_path = shutil.which("gh")
    if gh_path:
        result = subprocess.run(
            [gh_path, "release", "upload", tag, *(str(p) for p in assets), "--clobber"],
            cwd=ROOT,
        )
        upload_code = result.returncode
    else:
        print("'gh' not found, falling back to GitHub REST API upload.")
        upload_code = _upload_with_github_api(tag, assets)

    # Clean up local zip regardless of upload result
    if zip_name.exists():
        zip_name.unlink()
        print(f"(removed local {zip_name.name})")

    if upload_code != 0:
        print("\nError: release asset upload failed.")
        print("Use either:")
        print("  - gh auth login (if gh is installed), or")
        print("  - export GITHUB_TOKEN=<token-with-repo-write>")
        return 1

    repo = os.getenv("GITHUB_REPOSITORY", DEFAULT_REPO)
    print(f"\nDone. Full release assets uploaded:")
    print(f"  https://github.com/{repo}/releases/tag/{tag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
