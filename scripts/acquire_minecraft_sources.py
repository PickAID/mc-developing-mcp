#!/usr/bin/env python3
"""Acquire decompiled Minecraft Java sources (Mojmap) for a given version.

Pipeline per side (client / server):
  1. Download obfuscated JAR from Mojang
  2. Download Mojang ProGuard mappings (.txt)
  3. Remap JAR with AutoRenamingTool / ART  (obf → Mojmap, using --reverse)
  4. Decompile remapped JAR with VineFlower  (--folder → writes .java directly)
  5. Copy .java files into sources/{version}/minecraft/{client,server}-src/
  6. Update references/workspace/control.json

Requirements:
    - Java 17+ (brew install openjdk)
    - Internet access

Usage:
    python scripts/acquire_minecraft_sources.py --version 1.21.4
    python scripts/acquire_minecraft_sources.py --version 1.21.4 --version 1.21.5
    python scripts/acquire_minecraft_sources.py --version 1.21.4 --skip-client
    python scripts/acquire_minecraft_sources.py --version 1.21.4 --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_ROOT = ROOT / "sources"
CONTROL_FILE = ROOT / "references" / "workspace" / "control.json"

MOJANG_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"

VINEFLOWER_URL = (
    "https://github.com/Vineflower/vineflower/releases/download/1.10.1/"
    "vineflower-1.10.1.jar"
)
VINEFLOWER_SHA256 = "c3d2de9df4e5bb2d6ee69e3cd56b0f3286f7db1ac6e7898f47bd88e58b0e68ce"

# AutoRenamingTool (ART) from NeoForge — supports Mojang ProGuard mapping format natively
ART_URL = (
    "https://maven.neoforged.net/releases/net/neoforged/AutoRenamingTool/2.0.18/"
    "AutoRenamingTool-2.0.18-all.jar"
)
ART_FILENAME = "AutoRenamingTool-2.0.18-all.jar"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download(url: str, dest: Path, expected_sha256: str | None = None) -> None:
    print(f"  Downloading {dest.name} ...", flush=True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    try:
        with urllib.request.urlopen(url, timeout=300) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            with open(tmp, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 256)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded / total * 100
                        print(
                            f"\r    {pct:5.1f}%  "
                            f"{downloaded // 1024 // 1024} / {total // 1024 // 1024} MB",
                            end="",
                            flush=True,
                        )
        print()
        if expected_sha256:
            digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
            if digest != expected_sha256:
                tmp.unlink(missing_ok=True)
                raise RuntimeError(
                    f"SHA-256 mismatch for {dest.name}: expected {expected_sha256}, got {digest}"
                )
        tmp.rename(dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _get_tool(url: str, cache_dir: Path, filename: str, sha256: str | None = None) -> Path:
    jar = cache_dir / filename
    if not jar.exists():
        _download(url, jar, sha256)
    return jar


def _fetch_version_meta(version_id: str) -> dict:
    print(f"  Fetching Mojang version manifest ...", flush=True)
    with urllib.request.urlopen(MOJANG_MANIFEST, timeout=30) as r:
        manifest = json.loads(r.read())
    for v in manifest["versions"]:
        if v["id"] == version_id:
            with urllib.request.urlopen(v["url"], timeout=30) as r:
                return json.loads(r.read())
    raise ValueError(f"Version {version_id!r} not found in Mojang manifest")


def _find_java() -> str:
    candidates = [
        "java",
        "/opt/homebrew/opt/openjdk/bin/java",
        "/usr/local/opt/openjdk/bin/java",
        "/usr/lib/jvm/java-17-openjdk/bin/java",
        "/usr/lib/jvm/temurin-17/bin/java",
    ]
    for candidate in candidates:
        if shutil.which(candidate) or Path(candidate).is_file():
            try:
                r = subprocess.run([candidate, "-version"], capture_output=True, timeout=5)
                if r.returncode == 0:
                    return candidate
            except Exception:
                pass
    raise RuntimeError(
        "Java not found. Install with:\n"
        "  brew install openjdk\n"
        "Then ensure it is on PATH."
    )


def _remap_jar_art(
    java: str, art_jar: Path, input_jar: Path, mappings_txt: Path, output_jar: Path
) -> None:
    """Apply Mojang ProGuard mappings (named→obf) in reverse to get obf→named.

    ART natively reads Mojang ProGuard format.  --reverse means the mapping
    file maps named→obf, so ART reverses it to obf→named (exactly what we need).
    """
    print(f"  Remapping {input_jar.name} with ART ...", flush=True)
    cmd = [
        java, "-jar", str(art_jar),
        "--input", str(input_jar),
        "--output", str(output_jar),
        "--map", str(mappings_txt),
        "--reverse",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(
            f"ART failed (rc={result.returncode}):\n"
            f"STDOUT: {result.stdout[-1500:]}\n"
            f"STDERR: {result.stderr[-1500:]}"
        )


def _decompile_to_dir(
    java: str, vineflower_jar: Path, input_jar: Path, output_dir: Path
) -> int:
    """Decompile *input_jar* into *output_dir* using VineFlower --folder mode.

    VineFlower writes .java files directly into output_dir when given a
    directory as the output argument.  Returns the number of .java files written.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        java, "-jar", str(vineflower_jar),
        "-rsy=0",   # disable synthetic-access inlining (faster, fewer side-effects)
        "--folder",
        str(input_jar),
        str(output_dir),
    ]
    print(f"  Decompiling {input_jar.name} → {output_dir.name}/ ...", flush=True)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if result.returncode != 0:
        raise RuntimeError(
            f"VineFlower failed (rc={result.returncode}):\n{result.stderr[-2000:]}"
        )
    count = sum(1 for _ in output_dir.rglob("*.java"))
    return count


def _copy_sources(src_dir: Path, dest_dir: Path) -> int:
    """Copy .java files from src_dir to dest_dir, preserving sub-paths."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for java_file in src_dir.rglob("*.java"):
        rel = java_file.relative_to(src_dir)
        out = dest_dir / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(java_file, out)
        count += 1
    return count


def _update_control_json(version_id: str) -> None:
    data = json.loads(CONTROL_FILE.read_text(encoding="utf-8"))
    corpora = data.setdefault("corpora", {})
    changed = False
    if version_id not in corpora:
        corpora[version_id] = {
            "minecraft": {"source_root": f"sources/{version_id}/minecraft"},
        }
        changed = True
    else:
        existing = corpora[version_id]
        if "minecraft" not in existing:
            existing["minecraft"] = {"source_root": f"sources/{version_id}/minecraft"}
            changed = True
    if changed:
        data["generated"] = (
            __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        CONTROL_FILE.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"  Updated control.json: added {version_id}/minecraft")
    else:
        print(f"  control.json: {version_id}/minecraft already configured")


# ---------------------------------------------------------------------------
# Main acquisition logic
# ---------------------------------------------------------------------------

def _extract_bundled_server_jar(bundle_jar: Path, dest_dir: Path, version_id: str) -> Path | None:
    """If *bundle_jar* is a Minecraft server bundle (since ~1.17), extract the
    inner server JAR from META-INF/versions/{version_id}/server-{version_id}.jar.

    Returns the path to the extracted inner JAR, or None if this is not a bundle.
    """
    inner_name = f"META-INF/versions/{version_id}/server-{version_id}.jar"
    with zipfile.ZipFile(bundle_jar) as zf:
        names = zf.namelist()
        if inner_name not in names:
            return None  # Not a bundle — process the JAR directly
        print(f"  Server bundle detected — extracting inner server JAR ...", flush=True)
        dest_dir.mkdir(parents=True, exist_ok=True)
        inner_path = dest_dir / f"server-{version_id}-inner.jar"
        inner_path.write_bytes(zf.read(inner_name))
        return inner_path


def acquire_side(
    side: str,
    java: str,
    vineflower_jar: Path,
    art_jar: Path,
    meta: dict,
    version_id: str,
    dest_dir: Path,
    tmp: Path,
) -> None:
    """Download, remap, and decompile one side (client or server)."""
    downloads = meta["downloads"]
    jar_info = downloads[side]
    mappings_info = downloads.get(f"{side}_mappings")
    if mappings_info is None:
        raise RuntimeError(
            f"No {side}_mappings in Mojang meta for {version_id}. "
            "This version may pre-date Mojmap availability (requires >= 1.14.4)."
        )

    # Step 1: download obfuscated JAR
    jar_path = tmp / f"{side}-{version_id}.jar"
    _download(jar_info["url"], jar_path)

    # Step 1b: for server, unwrap the bundle JAR (Minecraft ≥ 1.17)
    if side == "server":
        inner = _extract_bundled_server_jar(jar_path, tmp, version_id)
        if inner is not None:
            jar_path = inner  # remap the inner JAR, not the bundle

    # Step 2: download ProGuard mappings
    mappings_path = tmp / f"{side}-{version_id}.txt"
    _download(mappings_info["url"], mappings_path)

    # Step 3: remap to Mojmap names using ART
    remapped_jar = tmp / f"{side}-{version_id}-remapped.jar"
    _remap_jar_art(java, art_jar, jar_path, mappings_path, remapped_jar)

    # Step 4: decompile with VineFlower --folder
    decompile_dir = tmp / f"{side}-decompiled"
    count = _decompile_to_dir(java, vineflower_jar, remapped_jar, decompile_dir)
    if count == 0:
        raise RuntimeError(
            f"VineFlower produced 0 .java files for {side} {version_id}."
        )

    # Step 5: copy to final destination
    copied = _copy_sources(decompile_dir, dest_dir)
    print(f"  {side.capitalize()}: {copied} Java files → {dest_dir.relative_to(ROOT)}")


def acquire_version(
    version_id: str,
    cache_dir: Path,
    skip_client: bool = False,
    skip_server: bool = False,
    dry_run: bool = False,
) -> None:
    print(f"\n=== Acquiring Minecraft {version_id} ===")

    client_dest = SOURCES_ROOT / version_id / "minecraft" / "client-src"
    server_dest = SOURCES_ROOT / version_id / "minecraft" / "server-src"

    if not skip_client and client_dest.exists() and any(client_dest.rglob("*.java")):
        count = sum(1 for _ in client_dest.rglob("*.java"))
        print(f"  SKIP client: {count} Java files already present in {client_dest.relative_to(ROOT)}")
        skip_client = True

    if not skip_server and server_dest.exists() and any(server_dest.rglob("*.java")):
        count = sum(1 for _ in server_dest.rglob("*.java"))
        print(f"  SKIP server: {count} Java files already present in {server_dest.relative_to(ROOT)}")
        skip_server = True

    if skip_client and skip_server:
        print(f"  Nothing to do for {version_id}")
        _update_control_json(version_id)
        return

    if dry_run:
        print(
            f"  DRY-RUN: would acquire {version_id} "
            f"(client={not skip_client}, server={not skip_server})"
        )
        print("  Pipeline: download JAR → remap (ART) → decompile (VineFlower)")
        return

    java = _find_java()
    vineflower_jar = _get_tool(VINEFLOWER_URL, cache_dir, "vineflower-1.10.1.jar", VINEFLOWER_SHA256)
    art_jar = _get_tool(ART_URL, cache_dir, ART_FILENAME)

    meta = _fetch_version_meta(version_id)

    with tempfile.TemporaryDirectory(prefix=f"mc-{version_id}-") as tmpdir:
        tmp = Path(tmpdir)

        if not skip_client:
            acquire_side("client", java, vineflower_jar, art_jar,
                         meta, version_id, client_dest, tmp)

        if not skip_server:
            acquire_side("server", java, vineflower_jar, art_jar,
                         meta, version_id, server_dest, tmp)

    _update_control_json(version_id)
    print(f"  Done: {version_id}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--version", action="append", dest="versions", metavar="VER",
        help="Minecraft version to acquire (repeat for multiple, default: 1.21.4 1.21.5)"
    )
    parser.add_argument("--skip-client", action="store_true", help="Skip client-side acquisition")
    parser.add_argument("--skip-server", action="store_true", help="Skip server-side acquisition")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without downloading")
    parser.add_argument(
        "--cache-dir", default=str(ROOT / ".decompiler-cache"),
        help="Cache directory for VineFlower and ART JARs (default: .decompiler-cache/)"
    )
    args = parser.parse_args()

    versions = args.versions or ["1.21.4", "1.21.5"]
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    for v in versions:
        acquire_version(
            version_id=v,
            cache_dir=cache_dir,
            skip_client=args.skip_client,
            skip_server=args.skip_server,
            dry_run=args.dry_run,
        )

    if not args.dry_run:
        print("\nAll versions acquired. Now run:")
        for v in versions:
            print(f"  python3 scripts/index_sources.py --version {v}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
