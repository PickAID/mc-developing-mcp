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
import urllib.parse
from pathlib import Path
from typing import Any, Optional, TypedDict, cast

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DOCS_DB = DATA_DIR / "minecraft_docs.sqlite"
REGISTRY_FILE = Path(__file__).resolve().parent / "third_party_registry.json"

VARIEDMC_LLMS_URL = "https://docs.variedmc.cc/llms.txt"
MISODE_CONFIG_URL = "https://raw.githubusercontent.com/misode/misode.github.io/master/src/config.json"
VANILLA_MCDOC_SYMBOLS_URL = "https://raw.githubusercontent.com/SpyglassMC/vanilla-mcdoc/generated/symbols.json"
DEFAULT_PRISM_INSTANCES_ROOT = Path.home() / "Library" / "Application Support" / "PrismLauncher" / "instances"

MODPACK_KUBEJS_SOURCES: list[dict[str, object]] = [
    {"version": "1.19.2", "repo": "Go-Camping/No-Flesh-Within-Chest", "ref": "main", "paths": ["kubejs"]},
    {"version": "1.20.1", "repo": "AllTheMods/atm9nf", "ref": "master", "paths": ["kubejs"]},
    {"version": "1.20.1", "repo": "Jasons-impart/Create-Delight-Remake", "ref": "main", "paths": ["kubejs"]},
    {"version": "1.20.1", "repo": "TqLxQuanZ/DeceasedCraft", "ref": "main", "paths": ["kubejs"]},
    {"version": "1.20.1", "repo": "GLDYM/Kumo-O-Tagayasu", "ref": "master", "paths": [".pakku/overrides/kubejs", "kubejs"]},
    {"version": "1.20.1", "repo": "Altnoir/AtlanAbyss", "ref": "1201", "paths": ["kubejs"]},
    {"version": "1.20.1", "repo": "Altnoir/SenDims-BanForges-ModPack", "ref": "main", "paths": ["kubejs"]},
    {"version": "1.21.1", "repo": "khazenor/farming-crossing-5", "ref": "main", "paths": ["kubejs"]},
    {"version": "1.21.1", "repo": "AllTheMods/All-the-Mons", "ref": "main", "paths": ["kubejs"]},
    {"version": "1.21.1", "repo": "AllTheMods/ATM-10", "ref": "main", "paths": ["kubejs"]},
]


class DocPage(TypedDict):
    library: str
    version: str
    category: str
    slug: str
    title: str
    content: str
    format: str
    source_url: str


class WebDocSourceBase(TypedDict):
    url: str


class WebDocSource(WebDocSourceBase, total=False):
    category: str
    slug: str
    title: str


class GithubDocSource(TypedDict):
    repo: str
    ref: str


class DocsRegistryEntryBase(TypedDict):
    library: str


class DocsRegistryEntry(DocsRegistryEntryBase, total=False):
    repo: str | None
    web_docs: dict[str, list[WebDocSource]]
    github_docs: dict[str, GithubDocSource]

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
) -> list[DocPage]:
    """Clone repo and extract all doc pages."""
    pages: list[DocPage] = []
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


def _safe_slug_text(text: str) -> str:
    out = text.lower().strip()
    out = out.replace(" ", "-")
    out = re.sub(r"[^a-z0-9/_\-.]", "-", out)
    out = re.sub(r"-+", "-", out)
    return out.strip("-/")


def _extract_markdown_links(content: str) -> list[str]:
    links = re.findall(r"\[[^\]]+\]\((https://[^)]+)\)", content)
    uniq: list[str] = []
    seen: set[str] = set()
    for link in links:
        cleaned = link.strip()
        if cleaned in seen:
            continue
        seen.add(cleaned)
        uniq.append(cleaned)
    return uniq


def _wiki_title_from_link(link: str) -> str:
    text = link.strip()
    if not text:
        return ""
    if text.startswith("http://") or text.startswith("https://"):
        parsed = urllib.parse.urlparse(text)
        path = parsed.path
        if path.startswith("/w/"):
            title = path[3:]
        elif path.startswith("/wiki/"):
            title = path[6:]
        else:
            title = path.strip("/")
    else:
        title = text
    title = title.split("#", 1)[0].split("?", 1)[0]
    title = urllib.parse.unquote(title).strip()
    return title.replace(" ", "_")


def fetch_minecraft_wiki_extract(title_or_link: str) -> str:
    title = _wiki_title_from_link(title_or_link)
    if not title:
        return ""
    params = {
        "action": "query",
        "format": "json",
        "prop": "extracts",
        "exintro": "1",
        "explaintext": "1",
        "redirects": "1",
        "titles": title,
    }
    url = "https://minecraft.wiki/api.php?" + urllib.parse.urlencode(params)
    text = fetch_url(url, timeout=30)
    if not text:
        return ""
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return ""
    if not isinstance(obj, dict):
        return ""
    query_obj = obj.get("query")
    if not isinstance(query_obj, dict):
        return ""
    pages_obj = query_obj.get("pages")
    if not isinstance(pages_obj, dict):
        return ""
    for page_obj in pages_obj.values():
        if not isinstance(page_obj, dict):
            continue
        extract_obj = page_obj.get("extract")
        if isinstance(extract_obj, str) and extract_obj.strip():
            return extract_obj.strip()
    return ""


def fetch_vanilla_mcdoc_symbols() -> dict[str, object]:
    text = fetch_url(VANILLA_MCDOC_SYMBOLS_URL, timeout=60)
    if not text:
        return {}
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return obj if isinstance(obj, dict) else {}


def _type_to_text(type_obj: object) -> str:
    if not isinstance(type_obj, dict):
        return "unknown"
    kind = str(type_obj.get("kind", "unknown"))
    if kind in {"string", "int", "float", "double", "byte", "short", "long", "boolean", "any"}:
        out = kind
        value_range = type_obj.get("valueRange")
        if isinstance(value_range, dict):
            min_v = value_range.get("min")
            max_v = value_range.get("max")
            if min_v is not None or max_v is not None:
                out += f" range[{min_v},{max_v}]"
        return out
    if kind == "reference":
        return f"ref:{type_obj.get('path', 'unknown')}"
    if kind == "list":
        return f"list<{_type_to_text(type_obj.get('item'))}>"
    if kind == "union":
        members_obj = type_obj.get("members")
        if isinstance(members_obj, list):
            members = [_type_to_text(m) for m in members_obj[:4]]
            suffix = " | ..." if len(members_obj) > 4 else ""
            return "union(" + " | ".join(members) + suffix + ")"
        return "union"
    if kind == "dispatcher":
        registry = str(type_obj.get("registry", ""))
        return f"dispatcher<{registry}>" if registry else "dispatcher"
    if kind == "struct":
        fields_obj = type_obj.get("fields")
        field_count = len(fields_obj) if isinstance(fields_obj, list) else 0
        return f"struct[{field_count} fields]"
    return kind


def _field_key_to_text(key_obj: object) -> str:
    if isinstance(key_obj, str):
        return key_obj
    if isinstance(key_obj, dict):
        value_obj = key_obj.get("value")
        if isinstance(value_obj, dict):
            lit = value_obj.get("value")
            if isinstance(lit, str):
                return lit
    return "<unknown>"


def _extract_since_until(field_obj: dict[str, object]) -> str:
    attrs_obj = field_obj.get("attributes")
    if not isinstance(attrs_obj, list):
        return ""
    parts: list[str] = []
    for attr in attrs_obj:
        if not isinstance(attr, dict):
            continue
        name = str(attr.get("name", "")).strip()
        if name not in {"since", "until"}:
            continue
        value_obj = attr.get("value")
        value = ""
        if isinstance(value_obj, dict):
            literal = value_obj.get("value")
            if isinstance(literal, dict):
                lit_val = literal.get("value")
                if isinstance(lit_val, str):
                    value = lit_val
        if value:
            parts.append(f"{name} {value}")
    return ", ".join(parts)


def _render_fields_recursive(
    fields_obj: list[object],
    mcdoc: dict[str, object],
    lines: list[str],
    indent: int = 0,
    depth: int = 0,
    max_depth: int = 3,
    visited_refs: set[str] | None = None,
) -> None:
    if visited_refs is None:
        visited_refs = set()
    prefix = "  " * indent
    for field in fields_obj:
        if not isinstance(field, dict):
            continue
        kind = str(field.get("kind", ""))
        if kind == "pair":
            key_text = _field_key_to_text(field.get("key"))
            type_obj = field.get("type")
            optional = " *(optional)*" if bool(field.get("optional", False)) else ""
            su = _extract_since_until(field)
            version_note = f" — *{su}*" if su else ""
            if not isinstance(type_obj, dict):
                lines.append(f"{prefix}- `{key_text}`: `unknown`{optional}{version_note}")
                continue
            type_kind = str(type_obj.get("kind", ""))
            if type_kind == "reference" and depth < max_depth:
                ref_path = str(type_obj.get("path", ""))
                ref_node = mcdoc.get(ref_path)
                if isinstance(ref_node, dict) and ref_path not in visited_refs:
                    visited_refs.add(ref_path)
                    ref_kind = str(ref_node.get("kind", ""))
                    short = ref_path.split("::")[-1]
                    lines.append(f"{prefix}- `{key_text}`: *{short}* (struct){optional}{version_note}")
                    nested = ref_node.get("fields")
                    if isinstance(nested, list) and nested and depth + 1 < max_depth:
                        _render_fields_recursive(nested, mcdoc, lines, indent + 1, depth + 1, max_depth, visited_refs)
                    continue
                else:
                    short = ref_path.split("::")[-1] if ref_path else "ref"
                    lines.append(f"{prefix}- `{key_text}`: *{short}*{optional}{version_note}")
                    continue
            if type_kind == "struct" and depth < max_depth:
                nested = type_obj.get("fields")
                if isinstance(nested, list) and nested:
                    lines.append(f"{prefix}- `{key_text}`: *struct*{optional}{version_note}")
                    _render_fields_recursive(nested, mcdoc, lines, indent + 1, depth + 1, max_depth, visited_refs)
                    continue
            if type_kind == "union":
                members_obj = type_obj.get("members")
                if isinstance(members_obj, list):
                    member_texts = []
                    for m in members_obj[:6]:
                        if isinstance(m, dict) and m.get("kind") == "struct":
                            member_texts.append("struct{...}")
                        else:
                            member_texts.append(_type_to_text(m))
                    suffix = " | ..." if len(members_obj) > 6 else ""
                    union_text = " | ".join(member_texts) + suffix
                    lines.append(f"{prefix}- `{key_text}`: `{union_text}`{optional}{version_note}")
                    continue
            type_text = _type_to_text(type_obj)
            lines.append(f"{prefix}- `{key_text}`: `{type_text}`{optional}{version_note}")
        elif kind == "spread":
            type_obj = field.get("type")
            su = _extract_since_until(field)
            version_note = f" *(since {su})*" if su else ""
            if isinstance(type_obj, dict):
                spread_kind = str(type_obj.get("kind", ""))
                if spread_kind == "struct":
                    nested = type_obj.get("fields")
                    if isinstance(nested, list):
                        if version_note:
                            lines.append(f"{prefix}*expanded fields{version_note}:*")
                        _render_fields_recursive(nested, mcdoc, lines, indent, depth, max_depth, visited_refs)
                elif spread_kind == "reference" and depth < max_depth:
                    ref_path = str(type_obj.get("path", ""))
                    ref_node = mcdoc.get(ref_path)
                    if isinstance(ref_node, dict) and ref_path not in visited_refs:
                        visited_refs.add(ref_path)
                        short = ref_path.split("::")[-1]
                        if version_note:
                            lines.append(f"{prefix}*spread from {short}{version_note}:*")
                        nested = ref_node.get("fields")
                        if isinstance(nested, list):
                            _render_fields_recursive(nested, mcdoc, lines, indent, depth + 1, max_depth, visited_refs)


def build_misode_schema_section(
    generator_id: str,
    path_text: str,
    symbols: dict[str, object],
) -> str:
    dispatcher_obj = symbols.get("mcdoc/dispatcher")
    mcdoc_obj = symbols.get("mcdoc")
    if not isinstance(dispatcher_obj, dict) or not isinstance(mcdoc_obj, dict):
        return ""

    resource_dispatcher = dispatcher_obj.get("minecraft:resource")
    if not isinstance(resource_dispatcher, dict):
        return ""

    candidates = []
    if path_text.strip():
        candidates.append(path_text.strip())
    if generator_id.strip() and generator_id.strip() not in candidates:
        candidates.append(generator_id.strip())

    dispatch_entry: dict[str, object] | None = None
    matched_key = ""
    for key in candidates:
        entry = resource_dispatcher.get(key)
        if isinstance(entry, dict):
            dispatch_entry = entry
            matched_key = key
            break
    if dispatch_entry is None:
        return ""

    ref_path_obj = dispatch_entry.get("path")
    if not isinstance(ref_path_obj, str) or not ref_path_obj.strip():
        return ""
    ref_path = ref_path_obj.strip()

    type_node_obj = mcdoc_obj.get(ref_path)
    if not isinstance(type_node_obj, dict):
        return ""

    short_name = ref_path.split("::")[-1]
    lines = [
        "## Misode Type Schema (vanilla-mcdoc)",
        f"- Resource key: `{matched_key}`",
        f"- Root type: `{short_name}` (`{ref_path}`)",
        f"- Root kind: `{type_node_obj.get('kind', 'unknown')}`",
    ]

    fields_obj = type_node_obj.get("fields")
    if isinstance(fields_obj, list) and fields_obj:
        lines.append("")
        lines.append("### Fields")
        _render_fields_recursive(
            fields_obj,
            mcdoc_obj,
            lines,
            indent=0,
            depth=0,
            max_depth=3,
            visited_refs={ref_path},
        )

    lines.extend([
        "",
        f"Source: {VANILLA_MCDOC_SYMBOLS_URL}",
    ])
    return "\n".join(lines)


def _guess_version_from_url(url: str) -> str:
    m = re.search(r"/(\d+\.\d+(?:\.\d+)?)(?:/|$)", url)
    if m:
        ver = m.group(1)
        if ver == "1.21":
            return "1.21.1"
        if ver == "1.20":
            return "1.20.1"
        if ver == "1.19":
            return "1.19.2"
        return ver
    return "unversioned"


def _version_tuple(version_text: str) -> tuple[int, ...]:
    if version_text == "unversioned":
        return ()
    nums = [int(x) for x in re.findall(r"\d+", version_text)]
    if not nums:
        return ()
    return tuple(nums)


def _version_in_range(version: str, min_version: Optional[str], max_version: Optional[str]) -> bool:
    v = _version_tuple(version)
    if not v:
        return False
    if min_version:
        min_v = _version_tuple(min_version)
        if min_v and v < min_v:
            return False
    if max_version:
        max_v = _version_tuple(max_version)
        if max_v and v > max_v:
            return False
    return True


def fetch_variedmc_full_docs(max_pages: int = 1200) -> list[DocPage]:
    pages: list[DocPage] = []
    index_text = fetch_url(VARIEDMC_LLMS_URL)
    if not index_text:
        print("    WARN: failed to fetch variedmc llms index")
        return pages

    links = _extract_markdown_links(index_text)
    selected: list[str] = []
    for link in links:
        if not link.startswith("https://docs.variedmc.cc/"):
            continue
        if not link.endswith(".md"):
            continue
        if "/modpack/kubejs/" in link or "/develop/vanilla/datapack/" in link:
            selected.append(link)

    if len(selected) > max_pages:
        selected = selected[:max_pages]

    print(f"    variedmc pages selected: {len(selected)}")
    for url in selected:
        raw = fetch_url(url)
        if not raw:
            continue
        content = clean_markdown(raw)
        if len(content.strip()) < 30:
            continue
        if "/modpack/kubejs/" in url:
            library = "kubejs"
            category = "guide"
        else:
            library = "datapack"
            category = "datapack"
        version = _guess_version_from_url(url)
        parsed = urllib.parse.urlparse(url)
        slug = _safe_slug_text(parsed.path.lstrip("/"))
        title = extract_title(content, Path(parsed.path).stem)
        pages.append({
            "library": library,
            "version": version,
            "category": category,
            "slug": slug,
            "title": title,
            "content": content,
            "format": "markdown",
            "source_url": url,
        })
    return pages


MCMETA_BASE = "https://raw.githubusercontent.com/misode/mcmeta"


def fetch_mcmeta_preset_examples(
    generator_id: str,
    version_ref: str,
    max_examples: int = 2,
    max_json_chars: int = 1200,
) -> str:
    summary_url = f"{MCMETA_BASE}/{version_ref}-summary/data/{generator_id}/data.min.json"
    raw = fetch_url(summary_url)

    preset_pairs: list[tuple[str, str]] = []

    if raw:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict) and data:
            sorted_items = sorted(data.items(), key=lambda kv: len(json.dumps(kv[1])))
            for preset_name, preset_value in sorted_items[:max_examples]:
                try:
                    pretty = json.dumps(preset_value, indent=2)
                except (TypeError, ValueError):
                    continue
                if len(pretty) > max_json_chars:
                    pretty = pretty[:max_json_chars].rstrip() + "\n  ...\n}"
                preset_pairs.append((preset_name, pretty))

    if not preset_pairs:
        return ""

    lines = ["", "### Vanilla Preset Examples"]
    for preset_name, pretty_json in preset_pairs:
        preset_id = f"minecraft:{preset_name}"
        lines.append(f"\n**`{preset_id}`** (from `{version_ref}-summary`):")
        lines.append("```json")
        lines.append(pretty_json)
        lines.append("```")

    lines.append(f"\nSource: {summary_url}")
    return "\n".join(lines)


def fetch_misode_datapack_docs() -> list[DocPage]:
    pages: list[DocPage] = []
    wiki_extract_cache: dict[str, str] = {}
    vanilla_symbols = fetch_vanilla_mcdoc_symbols()
    text = fetch_url(MISODE_CONFIG_URL)
    if not text:
        print("    WARN: failed to fetch misode config")
        return pages
    try:
        config = json.loads(text)
    except json.JSONDecodeError:
        print("    WARN: failed to parse misode config")
        return pages

    versions_obj = config.get("versions", [])
    generators_obj = config.get("generators", [])
    legacy_guides_obj = config.get("legacyGuides", [])
    languages_obj = config.get("languages", [])
    if not isinstance(versions_obj, list) or not isinstance(generators_obj, list):
        return pages

    version_rows: list[dict[str, object]] = []
    for version_item in versions_obj:
        if not isinstance(version_item, dict):
            continue
        version_ref = str(version_item.get("ref", "")).strip()
        if not version_ref:
            continue
        version_rows.append({
            "id": str(version_item.get("id", version_ref)),
            "ref": version_ref,
            "name": str(version_item.get("name", version_ref)),
            "pack_format": version_item.get("pack_format"),
        })

    index_lines = [
        "# Misode Datapack Generator Index",
        "",
        f"- Config URL: {MISODE_CONFIG_URL}",
        f"- Version entries: **{len(version_rows)}**",
        f"- Generator entries: **{len(generators_obj)}**",
    ]
    if isinstance(languages_obj, list):
        index_lines.append(f"- UI languages: **{len(languages_obj)}**")
    pages.append({
        "library": "misode",
        "version": "all",
        "category": "overview",
        "slug": "misode/index",
        "title": "Misode Datapack Generator Index",
        "content": "\n".join(index_lines),
        "format": "markdown",
        "source_url": MISODE_CONFIG_URL,
    })

    for version_info in version_rows:
        version_ref = str(version_info["ref"])
        pack_format = version_info.get("pack_format")
        by_tag: dict[str, list[str]] = {}
        generator_count = 0
        generator_with_path = 0
        generator_with_dependency = 0

        for generator in generators_obj:
            if not isinstance(generator, dict):
                continue
            min_v = generator.get("minVersion")
            max_v = generator.get("maxVersion")
            if isinstance(min_v, str) or isinstance(max_v, str):
                if not _version_in_range(version_ref, min_v if isinstance(min_v, str) else None, max_v if isinstance(max_v, str) else None):
                    continue
            generator_id = str(generator.get("id", "")).strip()
            url = str(generator.get("url", "")).strip()
            if not generator_id or not url:
                continue
            tags_obj = generator.get("tags")
            tags: list[str] = ["datapack"]
            if isinstance(tags_obj, list):
                for tag in tags_obj:
                    if isinstance(tag, str) and tag.strip():
                        tags.append(tag.strip())
            for tag in tags:
                by_tag.setdefault(tag, []).append(generator_id)
            generator_count += 1

            wiki = str(generator.get("wiki", "")).strip()
            path_text = str(generator.get("path", "")).strip()
            dependency_text = str(generator.get("dependency", "")).strip()
            aliases_obj = generator.get("aliases")
            aliases: list[str] = []
            if isinstance(aliases_obj, list):
                aliases = [str(a).strip() for a in aliases_obj if str(a).strip()]
            if path_text:
                generator_with_path += 1
            if dependency_text:
                generator_with_dependency += 1
            content_lines = [
                f"# Misode Generator: {generator_id}",
                "",
                f"- Version: `{version_ref}`",
                f"- URL Path: `{url}`",
            ]
            if path_text:
                content_lines.append(f"- Datapack Path: `{path_text}`")
            if dependency_text:
                content_lines.append(f"- Dependency: `{dependency_text}`")
            if aliases:
                content_lines.append(f"- Aliases: `{', '.join(aliases)}`")
            if pack_format is not None:
                content_lines.append(f"- Pack Format: `{pack_format}`")
            if wiki:
                content_lines.append(f"- Minecraft Wiki: {wiki}")
            if tags:
                content_lines.append(f"- Tags: `{', '.join(sorted(set(tags)))}`")
            schema_section = build_misode_schema_section(generator_id, path_text, vanilla_symbols)
            wiki_extract = ""
            if wiki:
                wiki_title = _wiki_title_from_link(wiki)
                if wiki_title in wiki_extract_cache:
                    wiki_extract = wiki_extract_cache[wiki_title]
                else:
                    wiki_extract = fetch_minecraft_wiki_extract(wiki)
                    wiki_extract_cache[wiki_title] = wiki_extract
            if wiki_extract:
                if len(wiki_extract) > 2400:
                    wiki_extract = wiki_extract[:2400].rstrip() + "..."
                content_lines.extend([
                    "",
                    "## Minecraft Wiki Extract",
                    wiki_extract,
                ])
            if schema_section:
                content_lines.extend(["", schema_section])
            preset_section = fetch_mcmeta_preset_examples(generator_id, version_ref)
            if preset_section:
                content_lines.append(preset_section)
            content_lines.extend([
                "",
                "Source: Misode config.json (version-filtered entry).",
            ])
            pages.append({
                "library": "misode",
                "version": version_ref,
                "category": "generator",
                "slug": f"misode/{_safe_slug_text(version_ref)}/{_safe_slug_text(generator_id)}",
                "title": f"Misode {generator_id} ({version_ref})",
                "content": "\n".join(content_lines),
                "format": "markdown",
                "source_url": f"https://misode.github.io/{url}",
            })

        summary_lines = [
            f"# Misode Datapack Summary ({version_ref})",
            "",
            f"- Generator count: **{generator_count}**",
            f"- Generators with datapack path metadata: **{generator_with_path}**",
            f"- Generators with dependencies: **{generator_with_dependency}**",
        ]
        if pack_format is not None:
            summary_lines.append(f"- Pack format: **{pack_format}**")
        summary_lines.append("")
        summary_lines.append("## Tags")
        for tag in sorted(by_tag.keys()):
            summary_lines.append(f"- {tag}: {len(by_tag[tag])}")

        pages.append({
            "library": "misode",
            "version": version_ref,
            "category": "summary",
            "slug": f"misode/{_safe_slug_text(version_ref)}/summary",
            "title": f"Misode Datapack Summary {version_ref}",
            "content": "\n".join(summary_lines),
            "format": "markdown",
            "source_url": MISODE_CONFIG_URL,
        })

    if isinstance(legacy_guides_obj, list):
        for guide in legacy_guides_obj:
            if not isinstance(guide, dict):
                continue
            guide_id = str(guide.get("id", "")).strip()
            guide_title = str(guide.get("title", "")).strip()
            link = str(guide.get("link", "")).strip()
            if not guide_id or not link:
                continue
            wiki_url = f"https://minecraft.wiki/w/{urllib.parse.quote(link, safe='/:#?&=%')}"
            wiki_title = _wiki_title_from_link(link)
            if wiki_title in wiki_extract_cache:
                wiki_extract = wiki_extract_cache[wiki_title]
            else:
                wiki_extract = fetch_minecraft_wiki_extract(link)
                wiki_extract_cache[wiki_title] = wiki_extract
            guide_lines = [
                f"# Misode Legacy Guide: {guide_title or guide_id}",
                "",
                f"- Guide id: `{guide_id}`",
                f"- Minecraft Wiki link path: `{link}`",
                f"- Full URL: {wiki_url}",
            ]
            if wiki_extract:
                if len(wiki_extract) > 2400:
                    wiki_extract = wiki_extract[:2400].rstrip() + "..."
                guide_lines.extend([
                    "",
                    "## Minecraft Wiki Extract",
                    wiki_extract,
                ])
            guide_lines.extend([
                "",
                "Source: Misode config.json legacyGuides entry.",
            ])
            pages.append({
                "library": "misode",
                "version": "all",
                "category": "guide",
                "slug": f"misode/legacy-guide/{_safe_slug_text(guide_id)}",
                "title": guide_title or f"Misode Legacy Guide {guide_id}",
                "content": "\n".join(guide_lines),
                "format": "markdown",
                "source_url": wiki_url,
            })

    return pages


def _collect_kubejs_files(repo_root: Path, path_hints: list[str], max_files: int) -> list[Path]:
    candidates: list[Path] = []
    for hint in path_hints:
        hint_path = repo_root / hint
        if hint_path.is_dir():
            candidates.append(hint_path)
    if not candidates:
        for fallback in [repo_root / "kubejs", repo_root / "overrides" / "kubejs"]:
            if fallback.is_dir():
                candidates.append(fallback)
    out: list[Path] = []
    for base in candidates:
        for pattern in ("*.js", "*.json", "*.json5", "*.zs", "*.md"):
            for file_path in base.rglob(pattern):
                if file_path.is_file():
                    out.append(file_path)
                    if len(out) >= max_files:
                        return out
    return out


def fetch_modpack_kubejs_docs(max_files_per_repo: int = 1200) -> list[DocPage]:
    pages: list[DocPage] = []
    for source in MODPACK_KUBEJS_SOURCES:
        version = str(source.get("version", "")).strip()
        repo = str(source.get("repo", "")).strip()
        ref = str(source.get("ref", "main")).strip() or "main"
        paths_obj = source.get("paths", ["kubejs"])
        paths = [str(p) for p in paths_obj] if isinstance(paths_obj, list) else ["kubejs"]
        if not version or not repo:
            continue

        print(f"    modpack {repo}@{ref} ({version})")
        with tempfile.TemporaryDirectory(prefix="modpack-kubejs-") as tmpdir:
            repo_path = Path(tmpdir) / "repo"
            if not clone_repo_for_docs(repo, ref, repo_path):
                print(f"    WARN: clone failed for {repo}@{ref}")
                continue

            kubejs_files = _collect_kubejs_files(repo_path, paths, max_files_per_repo)
            if not kubejs_files:
                print(f"    WARN: no kubejs files found in {repo}@{ref}")
                continue

            for file_path in kubejs_files:
                rel = str(file_path.relative_to(repo_path)).replace("\\", "/")
                content = file_path.read_text(encoding="utf-8", errors="replace")
                if not content.strip():
                    continue
                if len(content) > 120000:
                    content = content[:120000]
                ext = file_path.suffix.lower().lstrip(".") or "txt"
                wrapped = "\n".join([
                    f"# Modpack KubeJS Source: {repo}",
                    "",
                    f"- Version: `{version}`",
                    f"- Ref: `{ref}`",
                    f"- Path: `{rel}`",
                    "",
                    f"```{ext}",
                    content,
                    "```",
                ])
                pages.append({
                    "library": "kubejs-modpack",
                    "version": version,
                    "category": "modpack-script",
                    "slug": f"modpack/{_safe_slug_text(repo)}/{_safe_slug_text(rel)}",
                    "title": f"{repo} :: {rel}",
                    "content": wrapped,
                    "format": "markdown",
                    "source_url": f"https://github.com/{repo}/blob/{ref}/{rel}",
                })

    return pages


def _read_minecraft_version_from_instance(instance_root: Path) -> str:
    mmc_pack = instance_root / "mmc-pack.json"
    if not mmc_pack.is_file():
        return "unknown"
    try:
        obj = json.loads(mmc_pack.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError):
        return "unknown"
    if not isinstance(obj, dict):
        return "unknown"
    components_obj = obj.get("components")
    if not isinstance(components_obj, list):
        return "unknown"
    for comp in components_obj:
        if not isinstance(comp, dict):
            continue
        uid = str(comp.get("uid", "")).strip()
        version = str(comp.get("version", "")).strip()
        if uid == "net.minecraft" and version:
            return version
    return "unknown"


def fetch_local_modpack_kubejs_docs(
    instances_root: Path,
    max_instances: int = 40,
    max_files_per_instance: int = 1200,
) -> list[DocPage]:
    pages: list[DocPage] = []
    if not instances_root.is_dir():
        print(f"    WARN: local modpack root not found: {instances_root}")
        return pages

    instance_dirs = [p for p in instances_root.iterdir() if p.is_dir()]
    instance_dirs.sort(key=lambda p: p.name.lower())
    for instance_dir in instance_dirs[:max_instances]:
        minecraft_root = instance_dir / "minecraft"
        kubejs_root = minecraft_root / "kubejs"
        if not kubejs_root.is_dir():
            continue

        version = _read_minecraft_version_from_instance(instance_dir)
        print(f"    local modpack {instance_dir.name} ({version})")
        file_count = 0
        for pattern in ("*.js", "*.json", "*.json5", "*.md"):
            for file_path in kubejs_root.rglob(pattern):
                if not file_path.is_file():
                    continue
                try:
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                if not content.strip():
                    continue
                if len(content) > 120000:
                    content = content[:120000]
                rel = file_path.relative_to(minecraft_root).as_posix()
                ext = file_path.suffix.lower().lstrip(".") or "txt"
                wrapped = "\n".join([
                    f"# Local Modpack KubeJS Source: {instance_dir.name}",
                    "",
                    f"- Version: `{version}`",
                    f"- Instance: `{instance_dir.name}`",
                    f"- Path: `{rel}`",
                    "",
                    f"```{ext}",
                    content,
                    "```",
                ])
                pages.append({
                    "library": "kubejs-modpack-local",
                    "version": version,
                    "category": "modpack-script-local",
                    "slug": f"local-modpack/{_safe_slug_text(instance_dir.name)}/{_safe_slug_text(rel)}",
                    "title": f"{instance_dir.name} :: {rel}",
                    "content": wrapped,
                    "format": "markdown",
                    "source_url": str(file_path),
                })
                file_count += 1
                if file_count >= max_files_per_instance:
                    break
            if file_count >= max_files_per_instance:
                break
    return pages


def fetch_web_docs(
    library: str,
    mc_version: str,
    urls: list[WebDocSource],
) -> list[DocPage]:
    """Fetch docs from web URLs."""
    pages: list[DocPage] = []
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
def get_docs_registry() -> list[DocsRegistryEntry]:
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
                "1.20.1": {"repo": "KubeJS-Mods/KubeJS", "ref": "2001"},
                "1.21.1": {"repo": "KubeJS-Mods/KubeJS", "ref": "2101"},
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


def insert_pages(conn: sqlite3.Connection, pages: list[DocPage]) -> int:
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
            row = cur.execute(
                "SELECT id FROM doc_pages WHERE library=? AND version=? AND slug=?",
                (page["library"], page["version"], page["slug"]),
            ).fetchone()
            if row is not None:
                doc_id = int(row[0])
                cur.execute("DELETE FROM doc_fts WHERE doc_id=?", (doc_id,))
                cur.execute(
                    "INSERT INTO doc_fts (doc_id, library, version, title, content, category) VALUES (?, ?, ?, ?, ?, ?)",
                    (doc_id, page["library"], page["version"], page["title"], page["content"], page["category"]),
                )
            count += 1
        except sqlite3.Error as e:
            print(f"    DB error: {e}")
    conn.commit()
    return count


# ---------------------------------------------------------------------------
# KubeJS special handling — fetch from variedmc.cc
# ---------------------------------------------------------------------------
def fetch_kubejs_docs() -> list[DocPage]:
    print("  Fetching KubeJS docs from variedmc.cc...")
    return fetch_variedmc_full_docs()


# ---------------------------------------------------------------------------
# Local reference docs — ingest docs/reference/*.md into the DB
# ---------------------------------------------------------------------------
REFERENCE_DOCS_DIR = ROOT / "docs" / "reference"

# Mapping from filename stem → (library, version, category, title)
# Files not listed here are ingested as library="reference", version="all", category="general"
REFERENCE_DOC_METADATA: dict[str, tuple[str, str, str, str]] = {
    "coremod-guide":           ("coremod",    "all",   "coremods",      "Coremod Guide: Mixin, MixinExtras, Access Transformers, JS Coremods"),
    "forge-neoforge-patterns": ("reference",  "all",   "loaders",       "Forge vs NeoForge Patterns Reference"),
    "mod-structure-lifecycle": ("reference",  "all",   "structure",     "Mod Structure and Lifecycle"),
    "event-system-catalog":    ("reference",  "all",   "events",        "Event System Catalog"),
    "kubejs-api-surface":      ("reference",  "all",   "kubejs",        "KubeJS API Surface Reference"),
    "kubejs-addon-ecosystem":  ("reference",  "all",   "kubejs",        "KubeJS Addon Ecosystem"),
    "kubejs-addon-deep-dive":  ("reference",  "all",   "kubejs",        "KubeJS Addon Deep Dive"),
    "blockentity-architecture":("reference",  "all",   "blocks",        "Block Entity Architecture"),
    "client-server-sides":     ("reference",  "all",   "architecture",  "Client/Server Sides Reference"),
    "data-generation":         ("reference",  "all",   "datagen",       "Data Generation Reference"),
    "datapack-structures":     ("reference",  "all",   "datapacks",     "Datapack Structures Reference"),
    "gui-menu-system":         ("reference",  "all",   "gui",           "GUI and Menu System Reference"),
    "mutability-contracts":    ("reference",  "all",   "architecture",  "Mutability Contracts Reference"),
    "networking-packets":      ("reference",  "all",   "networking",    "Networking and Packets Reference"),
    "rendering-pipeline":      ("reference",  "all",   "rendering",     "Rendering Pipeline Reference"),
    "third-party-quick-ref":   ("reference",  "all",   "libraries",     "Third-Party Library Quick Reference"),
    "version-migration-map":   ("reference",  "all",   "migration",     "Version Migration Map"),
    "worldgen-pipeline":       ("reference",  "all",   "worldgen",      "World Generation Pipeline Reference"),
}


def fetch_local_reference_docs() -> list[DocPage]:
    """Read all markdown files from docs/reference/ and return as DocPage list."""
    pages: list[DocPage] = []
    if not REFERENCE_DOCS_DIR.is_dir():
        print(f"  WARNING: reference docs dir not found: {REFERENCE_DOCS_DIR}")
        return pages

    for md_file in sorted(REFERENCE_DOCS_DIR.glob("*.md")):
        stem = md_file.stem
        content = md_file.read_text(encoding="utf-8").strip()
        if not content:
            continue

        if stem in REFERENCE_DOC_METADATA:
            library, version, category, title = REFERENCE_DOC_METADATA[stem]
        else:
            # Auto-derive title from first heading or filename
            first_line = content.split("\n", 1)[0]
            if first_line.startswith("#"):
                title = first_line.lstrip("#").strip()
            else:
                title = stem.replace("-", " ").title()
            library, version, category = "reference", "all", "general"

        slug = f"reference/{stem}"
        pages.append({
            "library":    library,
            "version":    version,
            "category":   category,
            "slug":       slug,
            "title":      title,
            "content":    content,
            "format":     "markdown",
            "source_url": f"docs/reference/{md_file.name}",
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
    parser.add_argument("--skip-reference-docs", action="store_true", help="Skip local reference docs ingestion")
    parser.add_argument("--skip-variedmc", action="store_true", help="Skip full variedmc kubejs/datapack ingestion")
    parser.add_argument("--skip-misode", action="store_true", help="Skip misode datapack ingestion")
    parser.add_argument("--skip-modpacks", action="store_true", help="Skip modpack kubejs source ingestion")
    parser.add_argument("--skip-local-modpacks", action="store_true", help="Skip local Prism modpack kubejs ingestion")
    parser.add_argument("--max-variedmc-pages", type=int, default=1200, help="Max pages from variedmc llms index")
    parser.add_argument("--max-modpack-files", type=int, default=1200, help="Max kubejs files per modpack repo")
    parser.add_argument("--max-local-modpack-files", type=int, default=1200, help="Max kubejs files per local modpack instance")
    parser.add_argument("--max-local-modpack-instances", type=int, default=40, help="Max local modpack instances to scan")
    parser.add_argument("--local-modpack-root", default=str(DEFAULT_PRISM_INSTANCES_ROOT), help="Prism instances directory for local modpack ingestion")
    args = parser.parse_args()

    registry = get_docs_registry()
    special_libraries = {"kubejs", "datapack", "misode", "kubejs-modpack", "kubejs-modpack-local", "reference", "coremod"}
    if args.library:
        registry = [r for r in registry if r["library"] == args.library]
        if not registry and args.library not in special_libraries:
            print(f"Library '{args.library}' not found in docs registry")
            return 1

    conn = ensure_db() if not args.dry_run else None
    total_pages = 0

    for lib_entry in registry:
        library = lib_entry["library"]
        print(f"\n{library}:")

        # GitHub repo docs
        github_docs = cast(dict[str, GithubDocSource], lib_entry.get("github_docs", {}))
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
        web_docs = cast(dict[str, list[WebDocSource]], lib_entry.get("web_docs", {}))
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

    reference_libraries = {"reference", "coremod"}
    should_fetch_reference_docs = not args.skip_reference_docs and (not args.library or args.library in reference_libraries)
    should_fetch_variedmc = not args.skip_variedmc and (not args.library or args.library in {"kubejs", "datapack"})
    should_fetch_misode = not args.skip_misode and (not args.library or args.library in {"datapack", "misode"})
    should_fetch_modpacks = not args.skip_modpacks and (not args.library or args.library in {"kubejs", "kubejs-modpack"})
    should_fetch_local_modpacks = not args.skip_local_modpacks and (not args.library or args.library in {"kubejs", "kubejs-modpack-local"})

    if should_fetch_reference_docs:
        print("\nreference docs (local):")
        if args.dry_run:
            print("  (dry run)")
        else:
            pages = fetch_local_reference_docs()
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"  OK: {count} reference doc pages")
                total_pages += count
            else:
                print("  no reference docs found")

    if should_fetch_variedmc:
        print("\nvariedmc (special):")
        if args.dry_run:
            print("  (dry run)")
        else:
            pages = fetch_variedmc_full_docs(max_pages=max(1, args.max_variedmc_pages))
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"  OK: {count} variedmc pages")
                total_pages += count
            else:
                print("  no variedmc docs fetched")

    if should_fetch_misode:
        print("\nmisode datapack (special):")
        if args.dry_run:
            print("  (dry run)")
        else:
            pages = fetch_misode_datapack_docs()
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"  OK: {count} misode datapack pages")
                total_pages += count
            else:
                print("  no misode datapack docs fetched")

    if should_fetch_modpacks:
        print("\nmodpack kubejs (special):")
        if args.dry_run:
            print("  (dry run)")
        else:
            pages = fetch_modpack_kubejs_docs(max_files_per_repo=max(1, args.max_modpack_files))
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"  OK: {count} modpack kubejs pages")
                total_pages += count
            else:
                print("  no modpack kubejs docs fetched")

    if should_fetch_local_modpacks:
        print("\nlocal modpack kubejs (special):")
        if args.dry_run:
            print("  (dry run)")
        else:
            local_root = Path(str(args.local_modpack_root)).expanduser()
            pages = fetch_local_modpack_kubejs_docs(
                instances_root=local_root,
                max_instances=max(1, int(args.max_local_modpack_instances)),
                max_files_per_instance=max(1, int(args.max_local_modpack_files)),
            )
            if pages:
                count = insert_pages(conn, pages) if conn else 0
                print(f"  OK: {count} local modpack kubejs pages")
                total_pages += count
            else:
                print("  no local modpack kubejs docs fetched")

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
