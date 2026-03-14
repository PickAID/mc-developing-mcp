#!/usr/bin/env python3
"""
download_release.py — Download minecraft_sources.sqlite from the latest GitHub Release.

Usage:
    python scripts/download_release.py [--version v1.0.0] [--out data/]

This script is for users who cloned the repo and need the large sources database
(~1.2GB) that is not included in git. It fetches the file from the latest
(or specified) GitHub Release without requiring authentication.
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

REPO = "PickAID/mc-developing-mcp"
ASSET_NAME = "minecraft_sources.sqlite"
API_BASE = "https://api.github.com"
DEFAULT_OUT = Path(__file__).parent.parent / "data"


def fetch_json(url: str) -> dict | list:
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def find_asset(releases: list, asset_name: str, tag: str | None = None) -> tuple[str, str] | None:
    """Return (download_url, tag_name) for the first matching asset."""
    for release in releases:
        if tag and release["tag_name"] != tag:
            continue
        for asset in release.get("assets", []):
            if asset["name"] == asset_name:
                return asset["browser_download_url"], release["tag_name"]
    return None


def download_with_progress(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")

    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk = 1024 * 1024  # 1 MB

            with open(tmp, "wb") as f:
                while True:
                    data = resp.read(chunk)
                    if not data:
                        break
                    f.write(data)
                    downloaded += len(data)
                    if total:
                        pct = downloaded / total * 100
                        mb = downloaded / 1024 / 1024
                        total_mb = total / 1024 / 1024
                        print(
                            f"\r  {pct:5.1f}%  {mb:.0f} / {total_mb:.0f} MB",
                            end="",
                            flush=True,
                        )
                    else:
                        mb = downloaded / 1024 / 1024
                        print(f"\r  Downloaded {mb:.0f} MB", end="", flush=True)

        print()  # newline after progress
        tmp.rename(dest)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--version",
        metavar="TAG",
        help="Specific release tag to download from (e.g. v1.0.0). Defaults to latest.",
    )
    parser.add_argument(
        "--out",
        metavar="DIR",
        default=str(DEFAULT_OUT),
        help=f"Output directory (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--asset",
        metavar="FILENAME",
        default=ASSET_NAME,
        help=f"Asset filename to download (default: {ASSET_NAME})",
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    dest = out_dir / args.asset

    # Skip if already present
    if dest.exists():
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"✓ {dest} already exists ({size_mb:.0f} MB). Delete it to re-download.")
        sys.exit(0)

    print(f"Fetching release list from github.com/{REPO} ...")
    try:
        releases = fetch_json(f"{API_BASE}/repos/{REPO}/releases")
    except urllib.error.HTTPError as e:
        print(f"✗ GitHub API error: {e.code} {e.reason}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"✗ Network error: {e.reason}")
        sys.exit(1)

    if not releases:
        print("✗ No releases found in this repository.")
        sys.exit(1)

    result = find_asset(releases, args.asset, args.version)
    if not result:
        tag_hint = args.version or "latest releases"
        print(f"✗ Asset '{args.asset}' not found in {tag_hint}.")
        print("  The first release requires manual upload of minecraft_sources.sqlite.")
        print("  Check: https://github.com/{REPO}/releases")
        sys.exit(1)

    download_url, tag_name = result
    print(f"  Found '{args.asset}' in release {tag_name}")
    print(f"  Downloading to: {dest}")
    print(f"  Source: {download_url}")
    print()

    try:
        download_with_progress(download_url, dest)
    except KeyboardInterrupt:
        print("\n✗ Download interrupted.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Download failed: {e}")
        sys.exit(1)

    final_mb = dest.stat().st_size / 1024 / 1024
    print(f"✓ Done: {dest} ({final_mb:.0f} MB)")


if __name__ == "__main__":
    main()
