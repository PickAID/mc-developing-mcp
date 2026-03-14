# mc-developing-mcp

> **Minecraft / KubeJS Development Assistant MCP Server**
> Provides AI coding assistants (Claude, Cursor, VS Code Copilot, etc.) with precise query capabilities over Minecraft source code, KubeJS APIs, and third-party addon libraries.

[中文文档](../README.md)

---

## Table of Contents

- [What Is This](#what-is-this)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
  - [Option A: Download Release Package (Recommended)](#option-a-download-release-package-recommended)
  - [Option B: Clone + Rebuild Databases](#option-b-clone--rebuild-databases)
- [Configuring Your AI Client](#configuring-your-ai-client)
- [Performance Modes](#performance-modes)
- [Database Details](#database-details)
- [Supported Third-Party Libraries](#supported-third-party-libraries)
- [FAQ](#faq)

---

## What Is This

`mc-developing-mcp` is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI assistants direct query access to:

- **Minecraft Java source code**: 76,000+ files, 1,100,000+ methods, 170,000+ classes
- **KubeJS API**: event system, script types, Forge/NeoForge event mappings
- **36 third-party libraries**: LootJS, PonderJS, EventJS, GeckoJS, and other KubeJS ecosystem addons
- **Official documentation**: 320 structured pages with full-text search

### Why SQLite instead of vector embeddings (RAG)?

For Minecraft development queries, SQLite + indexed lookup outperforms vector embeddings:

| Query type | SQLite (this project) | Vector embeddings |
|---|---|---|
| Exact class/method lookup by name | Sub-millisecond, 100% accurate | Semantic drift possible |
| List all methods in a class | Single indexed JOIN | Requires chunking + re-aggregation |
| Index 1.1M methods | Handled easily | Hours to embed + GBs of storage |
| Offline, zero API cost | ✅ | ❌ |
| Code structure / relational queries | SQL is built for this | Awkward to express |

Fuzzy documentation search is handled by **FTS5 full-text indexes**, covering both exact and semantic lookup needs.

---

## Architecture Overview

```
mc-developing-mcp/
├── mcp_server/
│   └── server.py          # MCP server (JSON-RPC over stdio)
├── data/
│   ├── minecraft_docs.sqlite    # Docs database (~20MB, included in repo)
│   └── minecraft_sources.sqlite # Sources database (1.2GB, download separately)
├── docs/
│   └── reference/         # 17 reference documents (KubeJS, Forge, NeoForge, etc.)
├── scripts/
│   └── download_release.py  # Helper script to download the large SQLite from GitHub Releases
├── SKILL.md               # Query rules for AI assistants using this server
├── config.json            # Performance configuration
└── version.json           # Version file — changes trigger CI/CD release
```

**Data flow**: AI assistant → MCP client → `server.py` (stdio) → SQLite databases → structured results

The server **does not need to run as a background daemon** — it is started and managed on-demand by your AI client.

---

## Quick Start

### Prerequisites

- Python 3.10+
- Install dependencies: `pip install -r requirements.txt`

---

### Option A: Download Release Package (Recommended)

The easiest path — the release package contains pre-built databases.

**Step 1: Download and extract**

Go to the [Releases page](https://github.com/PickAID/mc-developing-mcp/releases/latest) and download `mc-developing-mcp-full-vX.X.X.zip` (the full package, includes the sources database).

Extract to your preferred location, e.g.:
```
~/tools/mc-developing-mcp/
```

**Step 2: Install dependencies**

```bash
cd ~/tools/mc-developing-mcp
pip install -r requirements.txt
```

**Step 3: Configure your AI client** (see next section)

---

### Option B: Clone + Rebuild Databases

For developers who need to modify source code or rebuild databases from scratch.

**Step 1: Clone the repository**

```bash
git clone https://github.com/PickAID/mc-developing-mcp.git
cd mc-developing-mcp
pip install -r requirements.txt
```

**Step 2: Download the large database**

`minecraft_sources.sqlite` (1.2GB) is not included in git. Download it automatically:

```bash
python scripts/download_release.py
```

This script fetches `minecraft_sources.sqlite` from the latest GitHub Release into `data/`.

**Step 3: (Optional) Rebuild databases from Java source**

Only needed if you want to index a different Minecraft version:

```bash
# 1. Place Minecraft Java sources in sources/
# 2. Rebuild source index
python scripts/index_sources.py

# 3. Rebuild docs database
python scripts/fetch_docs.py
python scripts/init_docs_db.py
```

---

## Configuring Your AI Client

Add the MCP server to your AI client's configuration (replace the path with your actual installation path):

### Claude Desktop

Config file location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mc-developing-mcp": {
      "command": "python3",
      "args": ["/your/path/to/mc-developing-mcp/mcp_server/server.py"],
      "env": {
        "MC_MCP_MODE": "balanced"
      }
    }
  }
}
```

### Cursor / VS Code (with MCP extension)

In your project's `.cursor/mcp.json` or VS Code settings:

```json
{
  "mcpServers": {
    "mc-developing-mcp": {
      "command": "python3",
      "args": ["/your/path/to/mc-developing-mcp/mcp_server/server.py"]
    }
  }
}
```

### OpenCode

```json
{
  "mcp": {
    "servers": {
      "mc-developing-mcp": {
        "command": "python3",
        "args": ["/your/path/to/mc-developing-mcp/mcp_server/server.py"],
        "type": "local"
      }
    }
  }
}
```

---

## Performance Modes

Choose the mode that matches your hardware. Edit `config.json` or set an environment variable.

### Three preset modes

| Mode | Target hardware | Memory usage | Page cache | mmap size |
|---|---|---|---|---|
| `minimal` | Low-end machines (<4GB RAM) | ~200MB | 16MB | 128MB |
| `balanced` | Standard dev machine (4–8GB RAM) | ~700MB | 128MB | 512MB |
| `performance` | High-end workstation (16GB+ RAM) | ~2.5GB | 512MB | 2GB |

### Method 1: Edit config.json

```json
{
  "mode": "performance"
}
```

### Method 2: Environment variable

```bash
# One-time
MC_MCP_MODE=performance python3 mcp_server/server.py

# Or set it in your AI client config under the "env" field
```

### Method 3: Fine-tune individual parameters

```json
{
  "mode": "balanced",
  "sources_cache_kib": -262144,
  "sources_mmap_bytes": 1073741824,
  "find_class_lru": 8192
}
```

See `config.json` for documentation on all available keys.

---

## Database Details

### minecraft_sources.sqlite (sources database, 1.2GB)

| Content | Count |
|---|---|
| Java source files | 76,525 |
| Classes | 171,662 |
| Methods | 1,104,762 |
| Fields | 587,585 |
| Events | 6,358 |
| Third-party libraries | 36 |

This file is **not included in the git repository**. Obtain it via `scripts/download_release.py` or the release zip.

### minecraft_docs.sqlite (docs database, ~20MB)

| Content | Count |
|---|---|
| Documentation pages | 320 |
| Library/version entries | 48 |

This file **is included in the git repository** — available immediately after cloning.

---

## Supported Third-Party Libraries

36 third-party libraries are indexed, covering the major KubeJS ecosystem addons:

- **Core KubeJS addons**: LootJS, PonderJS, EventJS, GeckoJS, AnimationJS, AdvancementJS, RenderJS
- **Utilities**: KubeJS Additions, MoreJS, ModifyJS, KeyBindJS, FetchJS, FilesJS
- **System tools**: KubeLoader, KubePackages, KubeUtils, KubeJS Offline, Player Animator

All libraries are indexed with version isolation — specify the Minecraft version (1.20.1 / 1.21.1) when querying.

---

## FAQ

**Q: Server fails with `data/minecraft_sources.sqlite not found`**

```bash
python scripts/download_release.py
```

**Q: How do I switch to performance mode?**

Edit `config.json` and set `"mode": "performance"`, or add `"MC_MCP_MODE": "performance"` to your AI client's `env` config.

**Q: The AI can't find a specific method or class**

1. Confirm the database is downloaded (`data/minecraft_sources.sqlite` exists)
2. Check the Minecraft version (1.20.1 vs 1.21.1 — APIs differ significantly)
3. Try searching by class name prefix or package name

**Q: Do I need to rebuild the databases?**

Only if you need to index a different Minecraft version or add new third-party libraries. For regular use, just download the release package.

---

## License

MIT License — see [LICENSE](../LICENSE) file.
