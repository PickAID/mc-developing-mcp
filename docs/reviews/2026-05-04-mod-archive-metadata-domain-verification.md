# Mod Archive Metadata Domain Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice adds a focused `metadata` archive content domain for root and
`META-INF` mod metadata files:

- `fabric.mod.json`
- `quilt.mod.json`
- `*.mixin.json`
- `*.mixins.json`
- `pack.mcmeta`
- `META-INF/mods.toml`
- `META-INF/neoforge.mods.toml`

The goal is to let crash and modpack triage search local JAR metadata evidence
such as Mixin configs and loader descriptors without broadening the public MCP
tool surface.

## Red
Focused jar adapter red test:

```bash
pnpm vitest run packages/jar-source-adapter/src/archive-content.test.ts -t "metadata entries"
```

Observed failure before implementation:

```text
× extractArchiveContent > searches root and META-INF metadata entries for loader and mixin evidence
  → expected matches to include demo.mixins.json

actual matches:
  []
```

Focused MCP red test before routing `metadata` into `mod_archive_content`:

```bash
pnpm vitest run apps/mcp-server/src/mod-archive-metadata-content.test.ts
```

Observed failure:

```text
× mod archive metadata content search > searches mixin metadata files in discovered mod jars
  → expected matched true

actual domains:
  data, assets, java, class

actual matches:
  []
```

## Green
Focused jar adapter green:

```bash
pnpm vitest run packages/jar-source-adapter/src/archive-content.test.ts -t "metadata entries"
```

Result:

```text
✓ packages/jar-source-adapter/src/archive-content.test.ts (5 tests | 4 skipped) 7ms

Test Files  1 passed (1)
Tests  1 passed | 4 skipped (5)
```

Focused MCP green:

```bash
pnpm vitest run apps/mcp-server/src/mod-archive-metadata-content.test.ts
```

Result:

```text
✓ apps/mcp-server/src/mod-archive-metadata-content.test.ts (1 test) 11ms

Test Files  1 passed (1)
Tests  1 passed (1)
```

Related regression group:

```bash
pnpm vitest run packages/jar-source-adapter/src/archive-content.test.ts packages/jar-source-adapter/src/mod-archive-inventory.test.ts packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts apps/mcp-server/src/mod-archive-metadata-content.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests  11 passed (11)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  126 passed (126)
Tests  411 passed (411)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Value
Command:

```bash
pnpm tsx -e '...executeMcpServerModArchiveContent metadata fixture...'
```

Return value:

```json
{
  "matched": true,
  "summary": "Found 1 mod archive content match(es).",
  "payload": {
    "source": "mod_archive_content",
    "domains": [
      "data",
      "assets",
      "java",
      "class",
      "metadata"
    ],
    "queries": [
      "com.example.mixin"
    ],
    "archiveCount": 1,
    "searchedArchives": 1,
    "matches": [
      {
        "entry": {
          "relativePath": "demo.mixins.json",
          "domain": "metadata",
          "sizeBytes": 32
        },
        "line": 1,
        "column": 13,
        "preview": "{\"package\":\"com.example.mixin\"}",
        "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcp-meta-actual-TiURwi/mods/mixin-mod.jar",
        "archiveMetadata": {
          "loader": "fabric",
          "modId": "demo",
          "metadataPath": "fabric.mod.json"
        }
      }
    ],
    "skipped": [],
    "truncated": false
  }
}
```

## Notes
- `metadata` is intentionally narrow. It does not index every root file in a JAR.
- Mod archive inventory summaries now count metadata files, so local inventory
  can report loader/mixin evidence as first-class content.
- The MCP public surface stays unchanged; `mc_develop` continues through the
  existing `mod_archive_content` route.
