# Mod Archive Persistent Inventory Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Mod archive inventory now has a SQLite-backed persistent cache.

- `buildCachedModArchiveInventory` stores inventory records in SQLite.
- Cache validity is based on workspace root, inventory options, and archive fingerprints.
- MCP inventory requests use `runtimeRoot/caches/mod-archives/mod-archive-inventory.sqlite` by default.
- Repeated MCP requests can reuse cached inventory without rescanning jar contents.
- The cached payload preserves metadata, JarJar summary, and content-domain summary.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts
```

Initial failure:

```text
Cannot find module './mod-archive-inventory-persistent-cache.js'
```

MCP integration RED:

```text
Expected payload.persistentCache on inventory response.
Actual payload included mode: "inventory" but no persistentCache field.
```

## GREEN Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts (1 test) 6ms
 ✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (1 test) 8ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  23:23:19
   Duration  571ms (transform 162ms, setup 0ms, collect 402ms, tests 14ms, environment 0ms, prepare 122ms)
```

## Targeted Regression Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts packages/jar-source-adapter/src/mod-archive-inventory.test.ts packages/jar-source-adapter/src/archive-content.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 14ms
 ✓ packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts (1 test) 7ms
 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 9ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (11 tests) 40ms
 ✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (1 test) 11ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 30ms
 ✓ apps/mcp-server/src/context-query-executor.test.ts (4 tests) 176ms

 Test Files  7 passed (7)
      Tests  29 passed (29)
   Start at  23:23:40
   Duration  734ms (transform 492ms, setup 0ms, collect 1.51s, tests 285ms, environment 0ms, prepare 471ms)
```

## Typecheck Output
Command:

```bash
pnpm typecheck
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

## Full Test Output
Command:

```bash
pnpm test
```

Output:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run


 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 Test Files  94 passed (94)
      Tests  287 passed (287)
   Start at  23:26:55
   Duration  2.67s (transform 3.11s, setup 0ms, collect 13.71s, tests 6.77s, environment 9ms, prepare 5.43s)
```

## Real MCP SQLite Cache Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp runtime root and a temp modpack workspace.
# Calls executeMcpServerRequest twice with the same runtimeRoot and workspaceRoot.
# Prints persistentCache metadata from both inventory responses.
TS
```

Output:

```json
{
  "first": {
    "hit": false,
    "reason": "miss",
    "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-sqlite-Miklp8/caches/mod-archives/mod-archive-inventory.sqlite",
    "cacheKey": "3f34d86acb8963f3bb2e0936d57311fc2eb38b54870362ed5a8d09405d7bcef6",
    "archiveFingerprintCount": 1
  },
  "second": {
    "hit": true,
    "reason": "hit",
    "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-sqlite-Miklp8/caches/mod-archives/mod-archive-inventory.sqlite",
    "cacheKey": "3f34d86acb8963f3bb2e0936d57311fc2eb38b54870362ed5a8d09405d7bcef6",
    "archiveFingerprintCount": 1
  },
  "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-sqlite-Miklp8/caches/mod-archives/mod-archive-inventory.sqlite",
  "archiveCount": 1,
  "contentSummary": {
    "fileCount": 2,
    "byDomain": {
      "java": 0,
      "data": 1,
      "assets": 1,
      "class": 0
    }
  }
}
```
