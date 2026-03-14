#!/usr/bin/env python3
"""Fetch, clean, and organize documentation for the Minecraft docs database.

Extracts docs from:
  1. GitHub repos: README.md, docs/, wiki/ directories
  2. Web doc sites: KubeJS, Geckolib, etc. (via webfetch)

Cleans and categorizes content before DB insertion with version isolation.

Usage:
    python scripts/fetch_docs.py                    # fetch all
    python scripts/fetch_docs.py --library geckolib  # single lib
    python scripts/fetch_docs.py --dry-run           # show plan only
"""

from __future__ import annotations

import json
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DOCS_DB = DATA_DIR / "minecraft_docs.sqlite"
REGISTRY_FILE = Path(__file__).resolve().parent / "third_party_registry.json"

# ---------------------------------------------------------------------------
# Category inference from file path/name
# ---------------------------------------------------------------------------
_CATEGORY_PATTERNS: list[tuple[str, str]] = [
    (r"event", "events"),
    (r"recipe", "recipes"),
    (r"render|model|animation|texture", "rendering"),
    (r"config|setting|option", "configuration"),
    (r"network|packet", "networking"),
    (r"registr|block|item|entity|fluid", "registration"),
    (r"gui|screen|widget|menu", "gui"),
    (r"data\s?gen|tag|loot", "data"),
    (r"mixin|inject|shadow|core\s?mod", "mixin"),
    (r"get\s?start|setup|install|quick", "getting-started"),
    (r"api|reference|javadoc", "api"),
    (r"example|tutorial|guide|how", "guide"),
    (r"migrat|upgrad|changelog|breaking", "migration"),
    (r"faq|troubleshoot|debug", "troubleshooting"),
    (r"architect|multi.*platform|cross.*loader", "multiplatform"),
]


def infer_category(path: str, title: str = "") -> str:
    combined = f"{path} {title}".lower()
    for pattern, category in _CATEGORY_PATTERNS:
        if re.search(pattern, combined):
            return category
    return "general"


def path_to_slug(rel_path: str) -> str:
    slug = rel_path.replace("\\", "/")
    # Strip common prefixes
    for prefix in ("docs/", "wiki/", "doc/", "documentation/"):
        if slug.lower().startswith(prefix):
            slug = slug[len(prefix):]
    slug = re.sub(r'^versioned_docs/version-[^/]+/', '', slug, flags=re.IGNORECASE)
    # Remove extension
    if slug.endswith(".md"):
        slug = slug[:-3]
    if slug.endswith(".txt"):
        slug = slug[:-4]
    # Clean
    slug = slug.strip("/").lower()
    slug = re.sub(r"[^a-z0-9/\-_]", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "index"


# ---------------------------------------------------------------------------
# Content cleaning
# ---------------------------------------------------------------------------
def clean_markdown(content: str) -> str:
    lines = content.splitlines()
    cleaned: list[str] = []
    for line in lines:
        # Remove badge images
        if re.match(r"^\s*(\[!\[|<img\s.*badge)", line):
            continue
        # Remove HTML comments
        if re.match(r"^\s*<!--.*-->", line):
            continue
        cleaned.append(line)
    result = "\n".join(cleaned).strip()
    # Collapse excessive blank lines
    result = re.sub(r"\n{4,}", "\n\n\n", result)
    return result


def extract_title(content: str, fallback: str = "") -> str:
    for line in content.splitlines()[:10]:
        m = re.match(r"^#\s+(.+)", line)
        if m:
            return m.group(1).strip()
    return fallback


# ---------------------------------------------------------------------------
# GitHub repo doc extraction
# ---------------------------------------------------------------------------
def clone_repo_for_docs(repo: str, ref: str, dest: Path) -> bool:
    url = f"https://github.com/{repo}.git"
    cmd = [
        "git", "clone", "--depth", "1", "--branch", ref,
        "--single-branch", "--quiet", url, str(dest),
    ]
    try:
        import os
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"}
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def find_doc_files(repo_dir: Path) -> list[Path]:
    """Find all documentation files in a repo."""
    doc_files: list[Path] = []
    # Priority 1: docs/ directory
    for doc_dir in ["docs", "doc", "documentation", "wiki"]:
        d = repo_dir / doc_dir
        if d.is_dir():
            doc_files.extend(d.rglob("*.md"))
    # Priority 1b: versioned_docs/ (Docusaurus pattern, e.g. neoforged/Documentation)
    vd = repo_dir / "versioned_docs"
    if vd.is_dir():
        for version_dir in vd.iterdir():
            if version_dir.is_dir():
                doc_files.extend(version_dir.rglob("*.md"))
    # Priority 2: README files
    for readme in repo_dir.glob("README*"):
        if readme.is_file():
            doc_files.append(readme)
    # Priority 3: Root-level .md files (CONTRIBUTING, CHANGELOG, etc.)
    for md in repo_dir.glob("*.md"):
        if md not in doc_files:
            doc_files.append(md)
    return doc_files


def extract_repo_docs(
    repo: str,
    ref: str,
    library: str,
    mc_version: str,
) -> list[dict]:
    """Clone repo and extract all doc pages."""
    pages: list[dict] = []
    with tempfile.TemporaryDirectory(prefix=f"docs-{library}-") as tmpdir:
        tmp_path = Path(tmpdir) / "repo"
        if not clone_repo_for_docs(repo, ref, tmp_path):
            print(f"    WARN: clone failed for {repo}@{ref}")
            return pages

        doc_files = find_doc_files(tmp_path)
        if not doc_files:
            print(f"    WARN: no doc files found in {repo}@{ref}")
            return pages

        for doc_file in doc_files:
            try:
                raw = doc_file.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            if len(raw.strip()) < 50:
                continue  # Skip trivially short files

            rel_path = str(doc_file.relative_to(tmp_path))
            content = clean_markdown(raw)
            title = extract_title(content, doc_file.stem)
            slug = path_to_slug(rel_path)
            category = infer_category(rel_path, title)

            pages.append({
                "library": library,
                "version": mc_version,
                "category": category,
                "slug": slug,
                "title": title,
                "content": content,
                "format": "markdown",
                "source_url": f"https://github.com/{repo}/blob/{ref}/{rel_path}",
            })

    return pages


# ---------------------------------------------------------------------------
# Web doc fetching
# ---------------------------------------------------------------------------
def fetch_url(url: str, timeout: int = 30) -> Optional[str]:
    """Fetch URL content as text."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MCSkill-DocFetcher/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, TimeoutError):
        return None


def fetch_web_docs(
    library: str,
    mc_version: str,
    urls: list[dict],
) -> list[dict]:
    """Fetch docs from web URLs."""
    pages: list[dict] = []
    for url_info in urls:
        url = url_info["url"]
        category = url_info.get("category", "general")
        print(f"    fetching {url[:80]}...")
        content = fetch_url(url)
        if not content:
            print(f"    WARN: failed to fetch {url}")
            continue
        # If it looks like markdown, use as-is; otherwise clean
        if url.endswith(".md") or url.endswith(".txt"):
            content = clean_markdown(content)
        else:
            # Try to extract main content from HTML
            # Simple approach: strip HTML tags
            content = re.sub(r"<script[^>]*>.*?</script>", "", content, flags=re.DOTALL)
            content = re.sub(r"<style[^>]*>.*?</style>", "", content, flags=re.DOTALL)
            content = re.sub(r"<[^>]+>", "", content)
            content = re.sub(r"&[a-z]+;", " ", content)
            content = re.sub(r"\s+", " ", content).strip()

        title = extract_title(content, url_info.get("title", ""))
        slug = url_info.get("slug", path_to_slug(url.split("/")[-1]))

        pages.append({
            "library": library,
            "version": mc_version,
            "category": category,
            "slug": slug,
            "title": title,
            "content": content,
            "format": "markdown",
            "source_url": url,
        })
    return pages


# ---------------------------------------------------------------------------
# Docs registry — defines all doc sources per library
# ---------------------------------------------------------------------------
def get_docs_registry() -> list[dict]:
    """Define documentation sources for all libraries."""
    return [
        {
            "library": "kubejs",
            "repo": None,  # Docs are on web, not in source repo
            "web_docs": {
                "1.20.1": [
                    {"url": "https://raw.githubusercontent.com/nicholasgasior/kubejs-1201-docs/main/docs/events.md",
                     "category": "events", "slug": "events", "title": "KubeJS 1.20.1 Events"},
                ],
                "1.21.1": [],
            },
            "github_docs": {
                "1.20.1": {"repo": "KubeJS-Mods/KubeJS", "ref": "1.20.1"},
                "1.21.1": {"repo": "KubeJS-Mods/KubeJS", "ref": "2101/dev"},
            },
        },
        {
            "library": "geckolib",
            "github_docs": {
                "1.20.1": {"repo": "bernie-g/geckolib", "ref": "1.20.1"},
                "1.21.1": {"repo": "bernie-g/geckolib", "ref": "1.21.1"},
            },
        },
        {
            "library": "create",
            "github_docs": {
                "1.20.1": {"repo": "Creators-of-Create/Create", "ref": "mc1.20.1/dev"},
                "1.21.1": {"repo": "Creators-of-Create/Create", "ref": "mc1.21.1/dev"},
            },
        },
        {
            "library": "curios",
            "github_docs": {
                "1.20.1": {"repo": "TheIllusiveC4/Curios", "ref": "1.20.x"},
                "1.21.1": {"repo": "TheIllusiveC4/Curios", "ref": "1.21.1"},
            },
        },
        {
            "library": "architectury",
            "github_docs": {
                "1.20.1": {"repo": "architectury/architectury-api", "ref": "1.20"},
                "1.21.1": {"repo": "architectury/architectury-api", "ref": "1.21"},
            },
        },
        {
            "library": "cloth-config",
            "github_docs": {
                "1.20.1": {"repo": "shedaniel/cloth-config", "ref": "v11"},
                "1.21.1": {"repo": "shedaniel/cloth-config", "ref": "v15"},
            },
        },
        {
            "library": "yacl",
            "github_docs": {
                "1.20.1": {"repo": "isXander/YetAnotherConfigLib", "ref": "main"},
            },
        },
        {
            "library": "ldlib",
            "github_docs": {
                "1.20.1": {"repo": "Low-Drag-MC/LDLib-MultiLoader", "ref": "1.20.1"},
            },
        },
        {
            "library": "ldlib2",
            "github_docs": {
                "1.21.1": {"repo": "Low-Drag-MC/LDLib2", "ref": "1.21"},
            },
        },
        {
            "library": "ftb-library",
            "github_docs": {
                "1.20.1": {"repo": "FTBTeam/FTB-Library", "ref": "1.20.1/dev"},
                "1.21.1": {"repo": "FTBTeam/FTB-Library", "ref": "1.21.1/dev"},
            },
        },
        {
            "library": "registrate",
            "github_docs": {
                "1.20.1": {"repo": "tterrag1098/Registrate", "ref": "1.20"},
            },
        },
        {
            "library": "guideme",
            "github_docs": {
                "1.20.1": {"repo": "AppliedEnergistics/GuideME", "ref": "1.20.1"},
                "1.21.1": {"repo": "AppliedEnergistics/GuideME", "ref": "1.21.1"},
            },
        },
        {
            "library": "citadel",
            "github_docs": {
                "1.20.1": {"repo": "AlexModGuy/Citadel", "ref": "1.20"},
                "1.21.1": {"repo": "AlexModGuy/Citadel", "ref": "1.21"},
            },
        },
        {
            "library": "caelus",
            "github_docs": {
                "1.20.1": {"repo": "illusivesoulworks/caelus", "ref": "1.20.x"},
                "1.21.1": {"repo": "illusivesoulworks/caelus", "ref": "1.21.x"},
            },
        },
        {
            "library": "midnightlib",
            "github_docs": {
                "1.20.1": {"repo": "TeamMidnightDust/MidnightLib", "ref": "architectury-1.20.1"},
                "1.21.1": {"repo": "TeamMidnightDust/MidnightLib", "ref": "architectury-1.21.1"},
            },
        },
        {
            "library": "multiblocked2",
            "github_docs": {
                "1.20.1": {"repo": "Low-Drag-MC/Multiblocked2", "ref": "1.20.1"},
                "1.21.1": {"repo": "Low-Drag-MC/Multiblocked2", "ref": "1.21"},
            },
        },
        {
            "library": "photon",
            "github_docs": {
                "1.20.1": {"repo": "Low-Drag-MC/Photon", "ref": "1.20.1"},
                "1.21.1": {"repo": "Low-Drag-MC/Photon", "ref": "1.21"},
            },
        },
        {
            "library": "mixin",
            "github_docs": {
                "all": {"repo": "SpongePowered/Mixin", "ref": "master"},
            },
        },
        {
            "library": "mixinextras",
            "github_docs": {
                "all": {"repo": "LlamaLad7/MixinExtras", "ref": "master"},
            },
        },
        {
            "library": "forge-docs",
            "github_docs": {
                "1.20.1": {"repo": "MinecraftForge/Documentation", "ref": "1.20.x"},
            },
        },
        {
            "library": "neoforge-docs",
            "github_docs": {
                "1.21.1": {"repo": "neoforged/Documentation", "ref": "main"},
            },
        },
        {
            "library": "entityjs",
            "github_docs": {
                "1.20.1": {"repo": "liopyu/EntityJS", "ref": "EntityJS-1.20.1-forge"},
                "1.21.1": {"repo": "liopyu/EntityJS", "ref": "EntityJS-1.21-neo"},
            },
        },
        {
            "library": "lootjs",
            "github_docs": {
                "1.20.1": {"repo": "AlmostReliable/lootjs", "ref": "1.20.1"},
                "1.21.1": {"repo": "AlmostReliable/lootjs", "ref": "1.21.1"},
            },
        },
        {
            "library": "ponderjs",
            "github_docs": {
                "1.20.1": {"repo": "AlmostReliable/ponderjs", "ref": "1.20.1-forge"},
                "1.21.1": {"repo": "AlmostReliable/ponderjs", "ref": "1.21.1"},
            },
        },
        {
            "library": "renderjs",
            "github_docs": {
                "1.20.1": {"repo": "ch1335/RenderJS", "ref": "1.20.1"},
                "1.21.1": {"repo": "ch1335/RenderJS", "ref": "neoforge-1.21.1"},
            },
        },
        {
            "library": "geckojs",
            "github_docs": {
                "1.20.1": {"repo": "westernat/GeckoJS", "ref": "2001/forge"},
            },
        },
        {
            "library": "animationjs",
            "github_docs": {
                "1.20.1": {"repo": "liopyu/AnimationJS", "ref": "1.20.1"},
                "1.21.1": {"repo": "liopyu/AnimationJS", "ref": "1.21"},
            },
        },
        {
            "library": "advancementjs",
            "github_docs": {
                "1.20.1": {"repo": "westernat/AdvancementJS", "ref": "2001/forge"},
            },
        },
        {
            "library": "kubejs-additions",
            "github_docs": {
                "1.20.1": {"repo": "Hunter19823/kubejsadditions", "ref": "1.20.1"},
                "1.21.1": {"repo": "Hunter19823/kubejsadditions", "ref": "1.21.1"},
            },
        },
        {
            "library": "morejs",
            "github_docs": {
                "1.20.1": {"repo": "AlmostReliable/morejs", "ref": "1.20.1"},
                "1.21.1": {"repo": "AlmostReliable/morejs", "ref": "1.21.1"},
            },
        },
        {
            "library": "player-animator",
            "github_docs": {
                "1.20.1": {"repo": "liopyu/liosplayerAnimatorAPI", "ref": "1.20.1"},
            },
        },
        {
            "library": "kubejs-offline",
            "github_docs": {
                "1.20.1": {"repo": "Hunter19823/kubejsoffline", "ref": "1.20.1"},
                "1.21.1": {"repo": "Hunter19823/kubejsoffline", "ref": "1.21"},
            },
        },
        {
            "library": "kubeutils",
            "github_docs": {
                "1.20.1": {"repo": "Nanite/KubeUtils", "ref": "mc/1.20.1"},
                "1.21.1": {"repo": "Nanite/KubeUtils", "ref": "mc/1.21.1"},
            },
        },
    ]


# ---------------------------------------------------------------------------
# DB operations
# ---------------------------------------------------------------------------
def ensure_db() -> sqlite3.Connection:
    """Ensure docs DB exists and return connection."""
    DOCS_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DOCS_DB))
    conn.executescript("""
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA cache_size=-65536;
        PRAGMA temp_store=MEMORY;

        CREATE TABLE IF NOT EXISTS doc_pages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            library     TEXT NOT NULL,
            version     TEXT NOT NULL,
            category    TEXT NOT NULL DEFAULT 'general',
            slug        TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL,
            format      TEXT NOT NULL DEFAULT 'markdown',
            source_url  TEXT NOT NULL DEFAULT '',
            fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(library, version, slug)
        );

        CREATE INDEX IF NOT EXISTS idx_dp_lib_ver ON doc_pages(library, version);
        CREATE INDEX IF NOT EXISTS idx_dp_category ON doc_pages(category);
        CREATE INDEX IF NOT EXISTS idx_dp_lib ON doc_pages(library);

        CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
            doc_id      UNINDEXED,
            library     UNINDEXED,
            version     UNINDEXED,
            title,
            content,
            category,
            tokenize = 'porter unicode61'
        );
    """)
    conn.commit()
    return conn


def insert_pages(conn: sqlite3.Connection, pages: list[dict]) -> int:
    """Insert doc pages into DB, updating existing ones. Returns count inserted."""
    count = 0
    cur = conn.cursor()
    for page in pages:
        # Skip empty content
        if not page.get("content", "").strip():
            continue
        try:
            cur.execute(
                """INSERT INTO doc_pages (library, version, category, slug, title, content, format, source_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(library, version, slug) DO UPDATE SET
                     category=excluded.category, title=excluded.title,
                     content=excluded.content, format=excluded.format,
                     source_url=excluded.source_url, fetched_at=datetime('now')""",
                (page["library"], page["version"], page["category"],
                 page["slug"], page["title"], page["content"],
                 page["format"], page["source_url"]),
            )
            doc_id = cur.lastrowid
            if doc_id:
                # Update FTS
                cur.execute("DELETE FROM doc_fts WHERE doc_id=?", (doc_id,))
                cur.execute(
                    "INSERT INTO doc_fts (doc_id, library, version, title, content, category) VALUES (?, ?, ?, ?, ?, ?)",
                    (doc_id, page["library"], page["version"],
                     page["title"], page["content"], page["category"]),
                )
            count += 1
        except sqlite3.Error as e:
            print(f"    DB error: {e}")
    conn.commit()
    return count


# ---------------------------------------------------------------------------
# KubeJS special handling — fetch from variedmc.cc
# ---------------------------------------------------------------------------
def fetch_kubejs_docs() -> list[dict]:
    """Fetch KubeJS documentation from variedmc.cc raw markdown."""
    pages: list[dict] = []
    base = "https://raw.githubusercontent.com/nicholasgasior/kubejs-1201-docs/main"

    # Try fetching the variedmc llms.txt for doc structure
    print("  Fetching KubeJS docs from variedmc.cc...")
    llms_url = "https://docs.variedmc.cc/llms.txt"
    llms_content = fetch_url(llms_url)
    if llms_content:
        pages.append({
            "library": "kubejs",
            "version": "1.20.1",
            "category": "general",
            "slug": "llms-overview",
            "title": "KubeJS LLM Reference",
            "content": clean_markdown(llms_content),
            "format": "markdown",
            "source_url": llms_url,
        })

    # Fetch key doc pages from variedmc raw markdown
    variedmc_docs = [
        ("en/modpack/kubejs/1.20.1/Introduction/Event/ServerScript/EventList.md", "events/server-event-list", "events", "Server Event List"),
        ("en/modpack/kubejs/1.20.1/Introduction/Event/ClientScript/EventList.md", "events/client-event-list", "events", "Client Event List"),
        ("en/modpack/kubejs/1.20.1/Introduction/Event/StartupScript/EventList.md", "events/startup-event-list", "events", "Startup Event List"),
        ("en/modpack/kubejs/1.20.1/Introduction/GlobalScope/Classes/Java.md", "api/java-wrapper", "api", "Java Wrapper Class"),
        ("en/modpack/kubejs/1.20.1/Introduction/Addon/ProbeJS/Summary.md", "guide/probejs", "guide", "ProbeJS Summary"),
    ]

    for doc_path, slug, category, title in variedmc_docs:
        url = f"https://raw.githubusercontent.com/CrychicTeam/CrychicDoc/main/docs/{doc_path}"
        print(f"    fetching {doc_path}...")
        content = fetch_url(url)
        if content:
            pages.append({
                "library": "kubejs",
                "version": "1.20.1",
                "category": category,
                "slug": slug,
                "title": title,
                "content": clean_markdown(content),
                "format": "markdown",
                "source_url": url,
            })
        else:
            print(f"    WARN: could not fetch {url}")

    # Official KubeJS wiki pages
    kubejs_wiki_pages = [
        ("https://raw.githubusercontent.com/KubeJS-Mods/wiki/main/wiki/events/index.md", "events/overview", "events", "Events Overview"),
        ("https://raw.githubusercontent.com/KubeJS-Mods/wiki/main/wiki/other/folder-structure.md", "guide/folder-structure", "guide", "Folder Structure"),
    ]

    for url, slug, category, title in kubejs_wiki_pages:
        print(f"    fetching {url.split('/')[-1]}...")
        content = fetch_url(url)
        if content:
            pages.append({
                "library": "kubejs",
                "version": "1.20.1",
                "category": category,
                "slug": slug,
                "title": title,
                "content": clean_markdown(content),
                "format": "markdown",
                "source_url": url,
            })

    return pages


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Fetch documentation for Minecraft mods")
    parser.add_argument("--library", help="Fetch only this library")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    registry = get_docs_registry()
    if args.library:
        registry = [r for r in registry if r["library"] == args.library]
        if not registry:
            print(f"Library '{args.library}' not found in docs registry")
            return 1

    conn = ensure_db() if not args.dry_run else None
    total_pages = 0

    for lib_entry in registry:
        library = lib_entry["library"]
        print(f"\n{library}:")

        # GitHub repo docs
        github_docs = lib_entry.get("github_docs", {})
        for mc_version, repo_info in github_docs.items():
            repo = repo_info["repo"]
            ref = repo_info["ref"]
            print(f"  {mc_version}: cloning {repo}@{ref} for docs...")
            if args.dry_run:
                print(f"    (dry run)")
                continue
            pages = extract_repo_docs(repo, ref, library, mc_version)
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"    OK: {count} doc pages from repo")
                total_pages += count
            else:
                print(f"    no docs found")

        # Web docs
        web_docs = lib_entry.get("web_docs", {})
        for mc_version, urls in web_docs.items():
            if not urls:
                continue
            print(f"  {mc_version}: fetching web docs...")
            if args.dry_run:
                print(f"    (dry run)")
                continue
            pages = fetch_web_docs(library, mc_version, urls)
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"    OK: {count} web doc pages")
                total_pages += count

    # Special: KubeJS docs from variedmc.cc
    if not args.library or args.library == "kubejs":
        print(f"\nkubejs (special):")
        if not args.dry_run:
            pages = fetch_kubejs_docs()
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"  OK: {count} KubeJS doc pages")
                total_pages += count

    if conn:
        # Optimize FTS
        try:
            conn.execute("INSERT INTO doc_fts(doc_fts) VALUES('optimize')")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        # Print stats
        total = conn.execute("SELECT COUNT(*) FROM doc_pages").fetchone()[0]
        by_lib = conn.execute(
            "SELECT library, version, COUNT(*) FROM doc_pages GROUP BY library, version ORDER BY library, version"
        ).fetchall()
        print(f"\n=== Docs DB Stats ===")
        print(f"Total pages: {total}")
        for lib, ver, cnt in by_lib:
            print(f"  {lib:20s} / {ver:10s}: {cnt:>4} pages")
        conn.close()

    print(f"\nDone: {total_pages} pages fetched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
