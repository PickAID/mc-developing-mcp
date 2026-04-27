# MDM Sources Foundation Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** 建立 `mdm-sources` 的第一阶段基础设施：稳定的 `packages/` 与 `registry/` 结构、可测试的 package/registry 工具、以及 batch release workflow，同时为 `minecraft/26.1`、`minecraft/26.1.1`、`neoforge/26.1` 建立正式 package 定义。
**Architecture:** 这份计划只覆盖 spec 里的阶段 1，不进入 MCP 本地缓存 substrate，也不进入 `vanilla-source-index phase A`。`mdm-sources` 先保持 legacy `index.json` 与 `modules/` 不动，在同仓库新增 `packages/`、`registry/`、Python tooling 与 GitHub Actions workflow；registry 在首次 release 前允许 `current_release=null`，第一次 batch release 要同时回写 package detail 与 index summary，使 MCP 后续只读 registry 就能判断 tag 与 digest。
**Tech Stack:** `mdm-sources` sibling repo、JSON package manifests、Python 3.9+ stdlib (`json`, `hashlib`, `pathlib`, `subprocess`, `zipfile`, `unittest`)、GitHub Actions YAML、`python3 -m tools.*`、`git`、`/usr/bin/env bash`、system `tar --zstd`。

---

## Scope Split

这个 spec 已经明确拆成 3 个顺序阶段。为了避免计划过长、任务链过重，这份计划只实现：

- `mdm-sources` 正式仓库基础化
- `packages/` 与 `registry/` 的稳定骨架
- batch release 的基础 workflow
- `minecraft/26.1`、`minecraft/26.1.1`、`neoforge/26.1` 的 package definition bootstrap

这份计划明确不实现：

- MCP `RegistryClient / PackageManager / DerivedManager`
- `vanilla-source-index phase A`
- 大体量上游资料下载与 full payload 导入

这三项将进入后续顺序计划。当前计划里只要求 package definition 已经可被 registry 和 release tooling 消费。

## Repo Roots

- `SKillUpdate`: `/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate`
- `mdm-sources`: `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`

以下路径若以 `../mdm-sources/` 开头，均相对于 `SKillUpdate` 根目录。

## File Structure

**Create**

- `../mdm-sources/README.md`
- `../mdm-sources/.gitignore`
- `../mdm-sources/tools/package_model.py`
- `../mdm-sources/tools/build_registry.py`
- `../mdm-sources/tools/validate_registry.py`
- `../mdm-sources/tools/build_release_assets.py`
- `../mdm-sources/tests/test_package_tools.py`
- `../mdm-sources/tests/test_package_bootstrap.py`
- `../mdm-sources/tests/test_release_assets.py`
- `../mdm-sources/registry/index.json`
- `../mdm-sources/registry/packages/.gitkeep`
- `../mdm-sources/packages/minecraft/26.1/source-pack/named/package.json`
- `../mdm-sources/packages/minecraft/26.1/source-pack/named/payload/placeholder.json`
- `../mdm-sources/packages/minecraft/26.1/source-index/named/package.json`
- `../mdm-sources/packages/minecraft/26.1/source-index/named/payload/placeholder.json`
- `../mdm-sources/packages/minecraft/26.1.1/source-pack/named/package.json`
- `../mdm-sources/packages/minecraft/26.1.1/source-pack/named/payload/placeholder.json`
- `../mdm-sources/packages/neoforge/26.1/docs/core/package.json`
- `../mdm-sources/packages/neoforge/26.1/docs/core/payload/placeholder.json`
- `../mdm-sources/.github/workflows/validate-packages.yml`
- `../mdm-sources/.github/workflows/release-packages.yml`
- `../mdm-sources/docs/reviews/2026-04-19-mdm-sources-foundation-verification.md`

**Modify**

- `../mdm-sources/index.json`

**Keep Intact**

- `../mdm-sources/modules/core-docs/module.json`
- `../mdm-sources/modules/docs-search/module.json`
- `../mdm-sources/modules/jar-content-index/module.json`

**Boundaries**

- `tools/package_model.py`: 只定义 package manifest/registry 的结构解析与路径规则。
- `tools/build_registry.py`: 只负责从 `packages/` 生成或刷新 registry 快照，并在 package 仍存在时保留已有 `current_release` 元数据，不做 release 打包。
- `tools/validate_registry.py`: 只做一致性检查，不生成内容。
- `tools/build_release_assets.py`: 只负责从 package source 产出 release asset，并同时回写 package detail 与 index summary 的当前 release 信息。
- `tests/test_package_tools.py`: 只测工具层逻辑，不依赖真实 repo。
- `tests/test_package_bootstrap.py`: 只测 repo 内 bootstrap package definitions 是否存在且规则正确。
- `tests/test_release_assets.py`: 只测 release 产物命名、digest、package detail 回写与 index summary 回写。
- `index.json` 与 `modules/`: 本阶段保留 legacy 兼容，不迁移、不删除。

## Task 1: Add Package Model And Registry Tooling

**Files:**
- Create: `../mdm-sources/README.md`
- Create: `../mdm-sources/.gitignore`
- Create: `../mdm-sources/tools/package_model.py`
- Create: `../mdm-sources/tools/build_registry.py`
- Create: `../mdm-sources/tools/validate_registry.py`
- Test: `../mdm-sources/tests/test_package_tools.py`

- [ ] **Step 1: Write the failing package-tool tests**

```python
import json
import tempfile
import unittest
from pathlib import Path

from tools.build_registry import build_registry
from tools.package_model import discover_packages, load_package_manifest
from tools.validate_registry import validate_repo


class PackageToolsTest(unittest.TestCase):
    def write_package(self, repo_root: Path, rel_dir: str, body: dict) -> Path:
        package_dir = repo_root / rel_dir
        (package_dir / "payload").mkdir(parents=True, exist_ok=True)
        package_file = package_dir / "package.json"
        package_file.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        return package_file

    def test_load_package_manifest_derives_stable_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            package_file = self.write_package(
                repo_root,
                "packages/minecraft/26.1/source-pack/named",
                {
                    "namespace": "minecraft",
                    "version": "26.1",
                    "artifact_type": "source-pack",
                    "variant": "named",
                    "tags": ["vanilla", "source"],
                    "source_provenance": {"upstream": "minecraft"},
                    "dependencies": [],
                    "file_layout": {"root": "payload", "sources_dir": "payload/sources"},
                    "release_filename": "minecraft-26.1-source-pack-named.tar.zst",
                },
            )

            manifest = load_package_manifest(repo_root, package_file)

            self.assertEqual(manifest.id, "minecraft-26.1-source-pack-named")
            self.assertEqual(manifest.namespace, "minecraft")
            self.assertEqual(manifest.package_rel_dir, "packages/minecraft/26.1/source-pack/named")

    def test_build_registry_emits_null_release_entries_before_first_publish(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            self.write_package(
                repo_root,
                "packages/neoforge/26.1/docs/core",
                {
                    "namespace": "neoforge",
                    "version": "26.1",
                    "artifact_type": "docs/core",
                    "variant": "default",
                    "tags": ["docs", "loader"],
                    "source_provenance": {"upstream": "neoforged"},
                    "dependencies": [],
                    "file_layout": {"root": "payload"},
                    "release_filename": "neoforge-26.1-docs-core.zip",
                },
            )

            index_doc, package_docs = build_registry(repo_root)

            self.assertEqual(index_doc["packages"][0]["id"], "neoforge-26.1-docs-core")
            self.assertIsNone(package_docs["neoforge-26.1-docs-core"]["current_release"])

    def test_build_registry_preserves_existing_current_release_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            self.write_package(
                repo_root,
                "packages/minecraft/26.1/source-pack/named",
                {
                    "namespace": "minecraft",
                    "version": "26.1",
                    "artifact_type": "source-pack",
                    "variant": "named",
                    "tags": ["vanilla", "source"],
                    "source_provenance": {"upstream": "minecraft"},
                    "dependencies": [],
                    "file_layout": {"root": "payload", "sources_dir": "payload/sources"},
                    "release_filename": "minecraft-26.1-source-pack-named.tar.zst",
                },
            )
            registry_packages = repo_root / "registry" / "packages"
            registry_packages.mkdir(parents=True, exist_ok=True)
            (registry_packages / "minecraft-26.1-source-pack-named.json").write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "manifest": {"id": "minecraft-26.1-source-pack-named"},
                        "current_release": {
                            "release_tag": "batch-2026-04-19-minecraft-26.1-bootstrap",
                            "asset_name": "minecraft-26.1-source-pack-named.tar.zst",
                            "sha256": "abc123",
                            "asset_url": "https://example.invalid/minecraft-26.1-source-pack-named.tar.zst",
                        },
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

            index_doc, package_docs = build_registry(repo_root)

            self.assertEqual(
                package_docs["minecraft-26.1-source-pack-named"]["current_release"]["release_tag"],
                "batch-2026-04-19-minecraft-26.1-bootstrap",
            )
            self.assertEqual(index_doc["packages"][0]["current_release_tag"], "batch-2026-04-19-minecraft-26.1-bootstrap")
            self.assertEqual(index_doc["packages"][0]["current_release_digest"], "abc123")

    def test_validate_repo_rejects_category_in_primary_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            self.write_package(
                repo_root,
                "packages/mod/library/jei/26.1/source-pack/default",
                {
                    "namespace": "mod/jei",
                    "version": "26.1",
                    "artifact_type": "source-pack",
                    "variant": "default",
                    "tags": ["library"],
                    "source_provenance": {"upstream": "jei"},
                    "dependencies": [],
                    "file_layout": {"root": "payload"},
                    "release_filename": "mod-jei-26.1-source-pack.zip",
                },
            )

            errors = validate_repo(repo_root)

            self.assertIn("packages/mod/library/jei/26.1/source-pack/default", "\n".join(errors))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_package_tools.py -v`

Expected: FAIL with `ModuleNotFoundError` for `tools.package_model` / `tools.build_registry` / `tools.validate_registry`.

- [ ] **Step 3: Write the minimal tooling and repo docs**

```python
# ../mdm-sources/tools/package_model.py
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PackageManifest:
    id: str
    namespace: str
    version: str
    artifact_type: str
    variant: str
    tags: list[str]
    source_provenance: dict
    dependencies: list[dict]
    file_layout: dict
    release_filename: str
    package_file: Path
    package_rel_dir: str


def derive_package_id(namespace: str, version: str, artifact_type: str, variant: str) -> str:
    namespace_slug = namespace.replace("/", "-")
    artifact_slug = artifact_type.replace("/", "-")
    if variant == "default":
        return f"{namespace_slug}-{version}-{artifact_slug}"
    return f"{namespace_slug}-{version}-{artifact_slug}-{variant}"


def load_package_manifest(repo_root: Path, package_file: Path) -> PackageManifest:
    body = json.loads(package_file.read_text(encoding="utf-8"))
    package_rel_dir = package_file.parent.relative_to(repo_root).as_posix()
    return PackageManifest(
        id=derive_package_id(body["namespace"], body["version"], body["artifact_type"], body["variant"]),
        namespace=body["namespace"],
        version=body["version"],
        artifact_type=body["artifact_type"],
        variant=body["variant"],
        tags=list(body.get("tags", [])),
        source_provenance=dict(body["source_provenance"]),
        dependencies=list(body.get("dependencies", [])),
        file_layout=dict(body["file_layout"]),
        release_filename=body["release_filename"],
        package_file=package_file,
        package_rel_dir=package_rel_dir,
    )


def discover_packages(repo_root: Path) -> list[PackageManifest]:
    return sorted(
        [load_package_manifest(repo_root, package_file) for package_file in repo_root.glob("packages/**/package.json")],
        key=lambda item: item.id,
    )
```

```python
# ../mdm-sources/tools/build_registry.py
from __future__ import annotations

import json
from pathlib import Path

from tools.package_model import discover_packages


def load_existing_release_map(repo_root: Path) -> dict[str, dict | None]:
    package_root = repo_root / "registry" / "packages"
    if not package_root.exists():
        return {}
    release_map: dict[str, dict | None] = {}
    for package_doc_file in package_root.glob("*.json"):
        package_doc = json.loads(package_doc_file.read_text(encoding="utf-8"))
        manifest = package_doc.get("manifest", {})
        package_id = manifest.get("id") or package_doc_file.stem
        release_map[package_id] = package_doc.get("current_release")
    return release_map


def build_registry(repo_root: Path) -> tuple[dict, dict[str, dict]]:
    packages = discover_packages(repo_root)
    existing_release_map = load_existing_release_map(repo_root)
    index_doc = {
        "schema_version": 1,
        "packages": [
            {
                "id": package.id,
                "namespace": package.namespace,
                "version": package.version,
                "artifact_type": package.artifact_type,
                "variant": package.variant,
                "current_release_tag": (
                    existing_release_map[package.id]["release_tag"] if existing_release_map.get(package.id) else None
                ),
                "current_release_digest": (
                    existing_release_map[package.id]["sha256"] if existing_release_map.get(package.id) else None
                ),
            }
            for package in packages
        ],
    }
    package_docs = {
        package.id: {
            "schema_version": 1,
            "manifest": {
                "id": package.id,
                "namespace": package.namespace,
                "version": package.version,
                "artifact_type": package.artifact_type,
                "variant": package.variant,
                "tags": package.tags,
                "source_provenance": package.source_provenance,
                "dependencies": package.dependencies,
                "file_layout": package.file_layout,
                "release_filename": package.release_filename,
                "package_rel_dir": package.package_rel_dir,
            },
            "current_release": existing_release_map.get(package.id),
        }
        for package in packages
    }
    return index_doc, package_docs


def write_registry(repo_root: Path) -> None:
    index_doc, package_docs = build_registry(repo_root)
    registry_root = repo_root / "registry"
    packages_root = registry_root / "packages"
    packages_root.mkdir(parents=True, exist_ok=True)
    (registry_root / "index.json").write_text(json.dumps(index_doc, indent=2) + "\n", encoding="utf-8")
    for package_id, package_doc in package_docs.items():
        (packages_root / f"{package_id}.json").write_text(json.dumps(package_doc, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_registry(Path(__file__).resolve().parents[1])
```

```python
# ../mdm-sources/tools/validate_registry.py
from __future__ import annotations

from pathlib import Path

from tools.package_model import discover_packages


FORBIDDEN_PRIMARY_SEGMENTS = {"library", "content", "tooling", "api", "docs"}


def validate_repo(repo_root: Path) -> list[str]:
    errors: list[str] = []
    for package in discover_packages(repo_root):
        path_segments = set(package.package_rel_dir.split("/"))
        overlap = FORBIDDEN_PRIMARY_SEGMENTS & path_segments
        if overlap and package.package_rel_dir.startswith("packages/mod/"):
            errors.append(
                f"{package.package_rel_dir}: primary path must stay namespace-first; move classification tags {sorted(overlap)} into package.json tags"
            )
    return errors


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parents[1]
    errors = validate_repo(repo_root)
    if errors:
        raise SystemExit("\n".join(errors))
```

```text
# ../mdm-sources/README.md
# mdm-sources

Formal package-source and release-asset repository for MCP-consumable Minecraft ecosystem materials.

This repository now has two parallel layouts:
- `modules/` + root `index.json`: legacy compatibility layout; keep intact during transition
- `packages/` + `registry/`: new namespace-first package and registry layout
```

```text
# ../mdm-sources/.gitignore
dist/
__pycache__/
*.pyc
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_package_tools.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ../mdm-sources add README.md .gitignore tools/package_model.py tools/build_registry.py tools/validate_registry.py tests/test_package_tools.py
git -C ../mdm-sources commit -m "feat: add mdm-sources package registry tooling"
```

## Task 2: Bootstrap Namespace-First Packages And Registry Snapshot

**Files:**
- Create: `../mdm-sources/tests/test_package_bootstrap.py`
- Create: `../mdm-sources/registry/index.json`
- Create: `../mdm-sources/registry/packages/.gitkeep`
- Create: `../mdm-sources/packages/minecraft/26.1/source-pack/named/package.json`
- Create: `../mdm-sources/packages/minecraft/26.1/source-pack/named/payload/placeholder.json`
- Create: `../mdm-sources/packages/minecraft/26.1/source-index/named/package.json`
- Create: `../mdm-sources/packages/minecraft/26.1/source-index/named/payload/placeholder.json`
- Create: `../mdm-sources/packages/minecraft/26.1.1/source-pack/named/package.json`
- Create: `../mdm-sources/packages/minecraft/26.1.1/source-pack/named/payload/placeholder.json`
- Create: `../mdm-sources/packages/neoforge/26.1/docs/core/package.json`
- Create: `../mdm-sources/packages/neoforge/26.1/docs/core/payload/placeholder.json`
- Modify: `../mdm-sources/index.json`

- [ ] **Step 1: Write the failing bootstrap integration test**

```python
import json
import subprocess
import unittest
from pathlib import Path


class PackageBootstrapTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo_root = Path(__file__).resolve().parents[1]

    def test_bootstrap_packages_exist_and_registry_lists_them(self) -> None:
        subprocess.run(["python3", "-m", "tools.build_registry"], cwd=self.repo_root, check=True)

        index_doc = json.loads((self.repo_root / "registry" / "index.json").read_text(encoding="utf-8"))
        package_ids = {item["id"] for item in index_doc["packages"]}

        self.assertIn("minecraft-26.1-source-pack-named", package_ids)
        self.assertIn("minecraft-26.1-source-index-named", package_ids)
        self.assertIn("minecraft-26.1.1-source-pack-named", package_ids)
        self.assertIn("neoforge-26.1-docs-core", package_ids)

        package_doc = json.loads(
            (self.repo_root / "registry" / "packages" / "minecraft-26.1-source-pack-named.json").read_text(encoding="utf-8")
        )
        self.assertEqual(package_doc["manifest"]["namespace"], "minecraft")
        self.assertIsNone(package_doc["current_release"])

    def test_legacy_index_stays_intact_during_transition(self) -> None:
        legacy_index = json.loads((self.repo_root / "index.json").read_text(encoding="utf-8"))
        legacy_names = [item["name"] for item in legacy_index["modules"]]
        self.assertEqual(legacy_names, ["core-docs", "docs-search", "jar-content-index"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_package_bootstrap.py -v`

Expected: FAIL because `packages/minecraft/...` and `registry/index.json` do not exist yet.

- [ ] **Step 3: Create package definitions and build the initial registry snapshot**

```json
// ../mdm-sources/packages/minecraft/26.1/source-pack/named/package.json
{
  "namespace": "minecraft",
  "version": "26.1",
  "artifact_type": "source-pack",
  "variant": "named",
  "tags": ["vanilla", "source", "named", "official-release"],
  "source_provenance": {
    "upstream": "minecraft",
    "release_date": "2026-03-24"
  },
  "dependencies": [],
  "file_layout": {
    "root": "payload",
    "sources_dir": "payload/sources"
  },
  "release_filename": "minecraft-26.1-source-pack-named.tar.zst"
}
```

```json
// ../mdm-sources/packages/minecraft/26.1/source-index/named/package.json
{
  "namespace": "minecraft",
  "version": "26.1",
  "artifact_type": "source-index",
  "variant": "named",
  "tags": ["vanilla", "index", "named", "accelerator"],
  "source_provenance": {
    "upstream": "minecraft",
    "release_date": "2026-03-24"
  },
  "dependencies": [
    { "id": "minecraft-26.1-source-pack-named", "relationship": "build-input" }
  ],
  "file_layout": {
    "root": "payload",
    "index_dir": "payload/index"
  },
  "release_filename": "minecraft-26.1-source-index-named.zip"
}
```

```json
// ../mdm-sources/packages/minecraft/26.1.1/source-pack/named/package.json
{
  "namespace": "minecraft",
  "version": "26.1.1",
  "artifact_type": "source-pack",
  "variant": "named",
  "tags": ["vanilla", "source", "named", "hotfix-release"],
  "source_provenance": {
    "upstream": "minecraft",
    "release_date": "2026-04-01"
  },
  "dependencies": [],
  "file_layout": {
    "root": "payload",
    "sources_dir": "payload/sources"
  },
  "release_filename": "minecraft-26.1.1-source-pack-named.tar.zst"
}
```

```json
// ../mdm-sources/packages/neoforge/26.1/docs/core/package.json
{
  "namespace": "neoforge",
  "version": "26.1",
  "artifact_type": "docs/core",
  "variant": "default",
  "tags": ["loader", "docs", "core"],
  "source_provenance": {
    "upstream": "neoforged",
    "release_line": "26.1"
  },
  "dependencies": [],
  "file_layout": {
    "root": "payload",
    "docs_dir": "payload/docs"
  },
  "release_filename": "neoforge-26.1-docs-core.zip"
}
```

```json
// ../mdm-sources/packages/minecraft/26.1/source-pack/named/payload/placeholder.json
{
  "state": "metadata-only",
  "stage": "foundation",
  "note": "Real upstream source content is intentionally out of scope for stage 1."
}
```

```json
// ../mdm-sources/packages/minecraft/26.1/source-index/named/payload/placeholder.json
{
  "state": "metadata-only",
  "stage": "foundation",
  "note": "The published package identity is established now; MCP-local derived accelerators are out of scope for stage 1."
}
```

```json
// ../mdm-sources/packages/minecraft/26.1.1/source-pack/named/payload/placeholder.json
{
  "state": "metadata-only",
  "stage": "foundation",
  "note": "Hotfix package identity is reserved in the formal registry before payload ingestion."
}
```

```json
// ../mdm-sources/packages/neoforge/26.1/docs/core/payload/placeholder.json
{
  "state": "metadata-only",
  "stage": "foundation",
  "note": "Docs package coordinates and release filename are fixed in stage 1."
}
```

```json
// ../mdm-sources/index.json
{
  "modules": [
    { "name": "core-docs", "path": "modules/core-docs/module.json" },
    { "name": "docs-search", "path": "modules/docs-search/module.json" },
    { "name": "jar-content-index", "path": "modules/jar-content-index/module.json" }
  ],
  "transition_note": "legacy layout kept during packages-registry migration"
}
```

```bash
# from ../mdm-sources
mkdir -p registry/packages
touch registry/packages/.gitkeep
python3 -m tools.build_registry
```

- [ ] **Step 4: Run bootstrap tests to verify they pass**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_package_bootstrap.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ../mdm-sources add index.json registry packages tests/test_package_bootstrap.py
git -C ../mdm-sources commit -m "feat: bootstrap namespace-first package definitions"
```

## Task 3: Add Batch Release Asset Builder And GitHub Actions Workflows

**Files:**
- Create: `../mdm-sources/tools/build_release_assets.py`
- Create: `../mdm-sources/tests/test_release_assets.py`
- Create: `../mdm-sources/.github/workflows/validate-packages.yml`
- Create: `../mdm-sources/.github/workflows/release-packages.yml`

- [ ] **Step 1: Write the failing release-asset test**

```python
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


class ReleaseAssetsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo_root = Path(__file__).resolve().parents[1]
        subprocess.run(["python3", "-m", "tools.build_registry"], cwd=self.repo_root, check=True)

    def test_build_release_assets_updates_registry_with_digest_and_tag(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dist_root = Path(temp_dir)
            subprocess.run(
                [
                    "python3",
                    "-m",
                    "tools.build_release_assets",
                    "--release-tag",
                    "batch-2026-04-19-minecraft-26.1-bootstrap",
                    "--package-id",
                    "minecraft-26.1-source-pack-named",
                    "--package-id",
                    "neoforge-26.1-docs-core",
                    "--dist-dir",
                    str(dist_root),
                ],
                cwd=self.repo_root,
                check=True,
            )

            self.assertTrue((dist_root / "minecraft-26.1-source-pack-named.tar.zst").exists())
            self.assertTrue((dist_root / "neoforge-26.1-docs-core.zip").exists())

            package_doc = json.loads(
                (self.repo_root / "registry" / "packages" / "minecraft-26.1-source-pack-named.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                package_doc["current_release"]["release_tag"],
                "batch-2026-04-19-minecraft-26.1-bootstrap",
            )
            self.assertTrue(package_doc["current_release"]["sha256"])

            index_doc = json.loads((self.repo_root / "registry" / "index.json").read_text(encoding="utf-8"))
            summary = next(item for item in index_doc["packages"] if item["id"] == "minecraft-26.1-source-pack-named")
            self.assertEqual(summary["current_release_tag"], "batch-2026-04-19-minecraft-26.1-bootstrap")
            self.assertTrue(summary["current_release_digest"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_release_assets.py -v`

Expected: FAIL because `tools/build_release_assets.py` does not exist yet.

- [ ] **Step 3: Write the release builder and workflows**

```python
# ../mdm-sources/tools/build_release_assets.py
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_doc_path(repo_root: Path, package_id: str) -> Path:
    return repo_root / "registry" / "packages" / f"{package_id}.json"


def load_index_doc(repo_root: Path) -> dict:
    return json.loads((repo_root / "registry" / "index.json").read_text(encoding="utf-8"))


def build_zip_from_payload(payload_dir: Path, output_path: Path) -> None:
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(payload_dir.rglob("*")):
            if item.is_file():
                archive.write(item, item.relative_to(payload_dir.parent))


def build_tar_zst_from_payload(payload_dir: Path, output_path: Path) -> None:
    subprocess.run(
        ["tar", "--zstd", "-cf", str(output_path), "-C", str(payload_dir.parent), payload_dir.name],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release-tag", required=True)
    parser.add_argument("--package-id", action="append", dest="package_ids", required=True)
    parser.add_argument("--dist-dir", required=True)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    dist_dir = Path(args.dist_dir)
    dist_dir.mkdir(parents=True, exist_ok=True)
    index_doc = load_index_doc(repo_root)
    package_summaries = {item["id"]: item for item in index_doc["packages"]}
    built_at_utc = datetime.now(timezone.utc).isoformat()

    for package_id in args.package_ids:
        package_doc_file = package_doc_path(repo_root, package_id)
        package_doc = json.loads(package_doc_file.read_text(encoding="utf-8"))
        manifest = package_doc["manifest"]
        package_root = repo_root / manifest["package_rel_dir"]
        payload_dir = package_root / "payload"
        output_path = dist_dir / manifest["release_filename"]
        if output_path.suffix == ".zip":
            build_zip_from_payload(payload_dir, output_path)
        else:
            build_tar_zst_from_payload(payload_dir, output_path)
        sha256 = sha256_file(output_path)
        package_doc["current_release"] = {
            "release_tag": args.release_tag,
            "asset_name": output_path.name,
            "sha256": sha256,
            "asset_url": f"https://github.com/PickAID/mdm-sources/releases/download/{args.release_tag}/{output_path.name}",
            "built_at_utc": built_at_utc,
        }
        package_doc_file.write_text(json.dumps(package_doc, indent=2) + "\n", encoding="utf-8")
        package_summaries[package_id]["current_release_tag"] = args.release_tag
        package_summaries[package_id]["current_release_digest"] = sha256

    (repo_root / "registry" / "index.json").write_text(json.dumps(index_doc, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
```

```yaml
# ../mdm-sources/.github/workflows/validate-packages.yml
name: validate-packages

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python3 -m tools.build_registry
      - run: python3 -m tools.validate_registry
      - run: git diff --exit-code -- registry
      - run: python3 -m unittest discover -s tests -p 'test_*.py' -v
```

```yaml
# ../mdm-sources/.github/workflows/release-packages.yml
name: release-packages

on:
  workflow_dispatch:
    inputs:
      release_tag:
        required: true
        type: string
      package_ids:
        required: true
        description: Comma-separated package ids.
        type: string

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python3 -m tools.build_registry
      - run: python3 -m tools.validate_registry
      - run: |
          package_args=()
          IFS=',' read -r -a raw_ids <<< "${{ inputs.package_ids }}"
          for raw_id in "${raw_ids[@]}"; do
            package_id="$(echo "$raw_id" | xargs)"
            if [ -n "$package_id" ]; then
              package_args+=(--package-id "$package_id")
            fi
          done
          python3 -m tools.build_release_assets \
            --release-tag "${{ inputs.release_tag }}" \
            --dist-dir dist \
            "${package_args[@]}"
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add registry
          if git diff --cached --quiet; then
            exit 0
          fi
          git commit -m "chore: update registry for ${{ inputs.release_tag }}"
          git push origin HEAD:${{ github.ref_name }}
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ inputs.release_tag }}
          files: |
            dist/*
            registry/index.json
            registry/packages/*.json
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_release_assets.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ../mdm-sources add tools/build_release_assets.py tests/test_release_assets.py .github/workflows/validate-packages.yml .github/workflows/release-packages.yml
git -C ../mdm-sources commit -m "feat: add mdm-sources batch release workflow"
```

## Task 4: Verify Foundation And Export Review Notes

**Files:**
- Create: `../mdm-sources/docs/reviews/2026-04-19-mdm-sources-foundation-verification.md`

- [ ] **Step 1: Write the failing verification stub**

````md
# MDM Sources Foundation Verification

Date: 2026-04-19
Author: m1hono
Status: FAIL pending local verification

## Required Evidence

- package tooling tests pass
- bootstrap registry lists the new package ids
- release asset build updates package detail and index summary with tag and digest
````

- [ ] **Step 2: Run the focused local verification**

Run: `cd ../mdm-sources && python3 -m unittest tests/test_package_tools.py tests/test_package_bootstrap.py tests/test_release_assets.py -v`

Expected: PASS.

Run: `cd ../mdm-sources && python3 -m tools.build_registry`

Expected: PASS with refreshed `../mdm-sources/registry/index.json` and `../mdm-sources/registry/packages/*.json`.

Run: `cd ../mdm-sources && python3 -m tools.build_release_assets --release-tag batch-2026-04-19-minecraft-26.1-bootstrap --package-id minecraft-26.1-source-pack-named --package-id neoforge-26.1-docs-core --dist-dir /tmp/mdm-sources-dist`

Expected: PASS with release assets in `/tmp/mdm-sources-dist` and updated `current_release` entries.

- [ ] **Step 3: Write the markdown review with actual observed values**

````md
# MDM Sources Foundation Verification

Date: 2026-04-19
Author: m1hono
Status: PASS

## Commands

```bash
cd ../mdm-sources
python3 -m unittest tests/test_package_tools.py tests/test_package_bootstrap.py tests/test_release_assets.py -v
python3 -m tools.build_registry
python3 -m tools.build_release_assets --release-tag batch-2026-04-19-minecraft-26.1-bootstrap --package-id minecraft-26.1-source-pack-named --package-id neoforge-26.1-docs-core --dist-dir /tmp/mdm-sources-dist
```

## Observed Values

- `registry/index.json` listed `minecraft-26.1-source-pack-named`, `minecraft-26.1-source-index-named`, `minecraft-26.1.1-source-pack-named`, and `neoforge-26.1-docs-core`.
- `registry/packages/minecraft-26.1-source-pack-named.json` moved from `current_release=null` to `current_release.release_tag="batch-2026-04-19-minecraft-26.1-bootstrap"`.
- `registry/index.json` updated `minecraft-26.1-source-pack-named.current_release_tag` and `current_release_digest` after the asset build.
- `/tmp/mdm-sources-dist` contained `minecraft-26.1-source-pack-named.tar.zst` and `neoforge-26.1-docs-core.zip`.
- Legacy `index.json` still kept the module names `core-docs`, `docs-search`, and `jar-content-index`.
````

- [ ] **Step 4: Run the full repo verification**

Run: `cd ../mdm-sources && python3 -m unittest discover -s tests -p 'test_*.py' -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ../mdm-sources add registry docs/reviews/2026-04-19-mdm-sources-foundation-verification.md
git -C ../mdm-sources commit -m "test: verify mdm-sources foundation"
```

## Self-Review

- Spec coverage:
  - `mdm-sources` 作为正式发布源：Task 1-3
  - `packages/` + `registry/` 骨架：Task 2
  - batch release workflow：Task 3
  - `minecraft/26.1`、`minecraft/26.1.1`、`neoforge/26.1` package bootstrap：Task 2
  - legacy `modules/` 与 root `index.json` 过渡保留：Task 2
  - review/export verification：Task 4
- Scope check:
  - MCP 本地缓存 substrate 与 `vanilla-source-index phase A` 已明确排除，避免计划链过长。
- Type consistency:
  - package identity 统一使用 `namespace + version + artifact_type + variant -> id`
  - registry 首次生成时使用 `current_release=null`，后续 refresh 保留已有 release 元数据
  - release 回写统一写到 `current_release.release_tag / asset_name / sha256 / asset_url / built_at_utc`，并同步更新 index summary
