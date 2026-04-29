# Mod Archive Inventory Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
The MCP can now summarize a modpack's mod archive inventory before choosing deeper read/search operations.

- `jar-source-adapter` exposes `buildModArchiveInventory`.
- Inventory entries include outer jar path, relative path, source root, mod metadata, and one-level JarJar nested metadata.
- Inventory uses the existing `ArchiveContentCache` for central directory hit/miss tracking.
- `mod_archive_content` recognizes inventory/index/summary requests before generic list routing.
- Explicit inventory requests route to `mod_archive_content` even before any mod jar is discovered, so empty workspaces return a stable inventory payload.
- Nested JarJar count truncation now contributes to the top-level `truncated` flag.
- The public MCP surface remains one progressive tool, `mc_develop`.

## RED Output
Adapter RED command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts
```

Initial failure:

```text
FAIL packages/jar-source-adapter/src/mod-archive-inventory.test.ts
Error: Cannot find module './mod-archive-inventory.js'
```

MCP RED command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts -t "inventory"
```

Initial MCP failure:

```text
Expected mode: "inventory" with archiveMetadata and nestedArchives.
Actual mode: "list"
Actual summary: "Listed 0 mod archive entrie(s)."
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - mods/outer-mod.jar containing fabric.mod.json
# - META-INF/jarjar/nested-content.jar containing fabric.mod.json
# Calls mc_develop request execution with:
# List mod archive inventory and JarJar nested jars for this modpack.
TS
```

Output:

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "preferredTool": "context.query",
    "status": "selected",
    "summary": "Listed 1 mod archive inventory entrie(s).",
    "payload": {
      "source": "mod_archive_content",
      "mode": "inventory",
      "archives": [
        {
          "relativePath": "mods/outer-mod.jar",
          "source": "mods-directory",
          "archiveMetadata": {
            "loader": "fabric",
            "modId": "outer_mod",
            "name": "Outer Mod",
            "version": "1.0.0",
            "metadataPath": "fabric.mod.json"
          },
          "nestedArchives": [
            {
              "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
              "embeddedArchiveMetadata": {
                "loader": "fabric",
                "modId": "nested_content",
                "name": "Nested Content",
                "version": "2.0.0",
                "metadataPath": "fabric.mod.json"
              },
              "sizeBytes": 193
            }
          ]
        }
      ],
      "archiveCount": 1,
      "truncated": false,
      "cache": {
        "centralDirectoryHits": 0,
        "centralDirectoryMisses": 1
      }
    }
  }
}
```

## Empty Inventory Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates an empty temp workspace.
# Calls mc_develop request execution with:
# List mod archive inventory and JarJar nested jars for this modpack.
TS
```

Output:

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-1-mod_archive_content",
    "routeStep": "mod_archive_content",
    "preferredTool": "context.query",
    "status": "selected",
    "summary": "Listed 0 mod archive inventory entrie(s).",
    "payload": {
      "source": "mod_archive_content",
      "mode": "inventory",
      "archives": [],
      "archiveCount": 0,
      "truncated": false,
      "cache": {
        "centralDirectoryHits": 0,
        "centralDirectoryMisses": 0
      }
    }
  }
}
```

## Review Follow-up
Subagent review found two issues after the first green run:

- Nested JarJar entries capped by `maxNestedArchives` did not set top-level `truncated: true`.
- Empty workspaces could miss the `mod_archive_content` candidate for explicit inventory requests and return a generic failure shape.

Fixes applied:

- Added a nested JarJar cap regression test and propagated nested truncation to the inventory result.
- Routed explicit inventory requests through the harness even when no mod archives exist.
- Added an empty workspace inventory regression test.
- Added an executor-level repeated inventory cache hit/miss regression test.

## Package Test Output
Command:

```bash
pnpm --filter @mcpskill/jar-source-adapter test
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 10ms
 ✓ packages/jar-source-adapter/src/mod-archives.test.ts (1 test) 5ms
 ✓ packages/jar-source-adapter/src/nested-archive-list.test.ts (1 test) 6ms
 ✓ packages/jar-source-adapter/src/nested-archive-read.test.ts (2 tests) 10ms
 ✓ packages/jar-source-adapter/src/class-owner.test.ts (3 tests) 17ms
 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 32ms
 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 36ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (3 tests) 33ms

 Test Files  8 passed (8)
      Tests  18 passed (18)
   Start at  19:32:26
   Duration  521ms (transform 236ms, setup 0ms, collect 533ms, tests 149ms, environment 1ms, prepare 948ms)
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run packages/agent-harness/src/task-route.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts packages/jar-source-adapter/src/mod-archive-inventory.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/agent-harness/src/task-route.test.ts (10 tests) 3ms
 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 17ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (11 tests) 43ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 23ms

 Test Files  4 passed (4)
      Tests  29 passed (29)
   Start at  19:32:26
   Duration  1.08s (transform 616ms, setup 0ms, collect 1.41s, tests 87ms, environment 0ms, prepare 653ms)
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

## Workspace Test
Command:

```bash
pnpm test
```

Output summary:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  89 passed (89)
      Tests  282 passed (282)
   Start at  19:32:42
   Duration  2.50s (transform 3.12s, setup 0ms, collect 13.29s, tests 5.75s, environment 9ms, prepare 5.33s)
```

## Guardrails
Command:

```bash
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Output: no source/test files over 500 lines.

Command:

```bash
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output: no Go source/module files found.

Command:

```bash
git diff --check
```

Output: no whitespace errors.
