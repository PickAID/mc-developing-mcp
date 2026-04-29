# Mod Archive Metadata Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Mod archive matches now include loader metadata when the matched jar contains a known descriptor.

- `jar-source-adapter` reads `fabric.mod.json`.
- `jar-source-adapter` reads `META-INF/neoforge.mods.toml` and `META-INF/mods.toml`.
- Quilt metadata is also accepted through `quilt.mod.json`.
- `mod_archive_content` attaches `archiveMetadata` to content-search and class-owner matches.
- Selected archive read/list payloads include `archiveMetadata` when available.
- Metadata is read only for selected or matched jars, not every discovered mod jar.

## RED Outputs
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archives.test.ts
```

Initial failure:

```text
FAIL packages/jar-source-adapter/src/mod-archives.test.ts > readModArchiveMetadata > reads Fabric and NeoForge mod descriptors from jar metadata
TypeError: (0 , readModArchiveMetadata) is not a function
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts -t "adds mod metadata"
```

Initial MCP failure:

```text
FAIL apps/mcp-server/src/mod-archive-content-executor.test.ts > executeMcpServerModArchiveContent > adds mod metadata to content search matches

Expected archiveMetadata:
{
  "loader": "fabric",
  "modId": "content_mod",
  "name": "Content Mod",
  "version": "1.0.0",
  "metadataPath": "fabric.mod.json"
}

Actual match only had sourceArchive and entry details.
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - logs/latest.log containing demo:gear
# - mods/content-mod.jar containing fabric.mod.json and data/demo/recipes/gear.json
# Calls mc_develop and prints selectedEvidence.payload.matches[0].
TS
```

Output:

```json
{
  "toolNames": [
    "mc_develop"
  ],
  "text": {
    "type": "text",
    "text": "Selected: candidate-2-mod_archive_content (mod_archive_content, context.query)\nRoute: log_files -> mod_archive_content -> workspace_source -> docs_lookup\nExecuted: candidate-1-log_files, candidate-2-mod_archive_content\nContext: candidate-1-log_files\nSummary: Found 1 mod archive content match(es)."
  },
  "firstMatch": {
    "entry": {
      "relativePath": "data/demo/recipes/gear.json",
      "domain": "data",
      "sizeBytes": 23
    },
    "line": 1,
    "column": 12,
    "preview": "{\"result\":\"demo:gear\"}",
    "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-mod-meta-277mNd/mods/content-mod.jar",
    "archiveMetadata": {
      "loader": "fabric",
      "modId": "content_mod",
      "name": "Content Mod",
      "version": "1.0.0",
      "metadataPath": "fabric.mod.json"
    }
  }
}
```

## Package Test Output
Command:

```bash
pnpm --filter @mcpskill/jar-source-adapter test
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/class-owner.test.ts (2 tests) 4ms
 ✓ packages/jar-source-adapter/src/mod-archives.test.ts (1 test) 4ms
 ✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 6ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (2 tests) 11ms
 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 15ms

 Test Files  5 passed (5)
      Tests  10 passed (10)
   Start at  18:25:45
   Duration  258ms (transform 112ms, setup 0ms, collect 205ms, tests 39ms, environment 0ms, prepare 321ms)
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts packages/jar-source-adapter/src/mod-archives.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archives.test.ts (1 test) 3ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (5 tests) 21ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 28ms

 Test Files  3 passed (3)
      Tests  11 passed (11)
   Start at  18:25:53
   Duration  590ms (transform 243ms, setup 0ms, collect 520ms, tests 52ms, environment 1ms, prepare 168ms)
```

## Workspace Test
Command:

```bash
pnpm test
```

Output summary:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  85 passed (85)
      Tests  265 passed (265)
   Start at  18:26:46
   Duration  2.39s (transform 2.47s, setup 0ms, collect 11.49s, tests 5.83s, environment 9ms, prepare 5.60s)
```

## Typecheck
Command:

```bash
pnpm typecheck
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

No TypeScript errors were emitted.

## Guardrails
Command:

```bash
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Output: no source/test files over 500 lines.

Command:

```bash
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output: no Go source/module files found.

Command:

```bash
git diff --check
```

Output: no whitespace errors.
