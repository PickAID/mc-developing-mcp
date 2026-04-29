# Mod Archive Refresh And Stale Cache Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
SQLite-backed mod archive inventory cache now has two explicit reliability checks.

- MCP inventory requests can force a persistent cache refresh from natural language.
- Supported refresh signals include `refresh`, `rebuild`, `rescan`, `reload`, `force`, `invalidate`, `bypass cache`, `刷新`, `重建`, `重新扫描`, `强制`, `绕过缓存`, and `清理缓存`.
- The persistent cache rebuilds stale inventory when archive fingerprints change.
- After a refresh or stale rebuild, the next matching request can hit the rewritten SQLite record.

## RED Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ❯ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (2 tests | 1 failed) 18ms
   ✓ persistent mod archive inventory > reuses the runtime SQLite inventory cache across MCP requests 9ms
   × persistent mod archive inventory > refreshes the runtime SQLite inventory cache when requested 9ms
     → expected { …(12) } to match object { Object (payload) }

-       "hit": false,
-       "reason": "refresh",
+       "hit": true,
+       "reason": "hit",

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  23:29:46
   Duration  567ms (transform 137ms, setup 0ms, collect 344ms, tests 18ms, environment 0ms, prepare 67ms)
```

## GREEN Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archive-inventory-persistent-cache.test.ts (2 tests) 15ms
 ✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (2 tests) 13ms

 Test Files  2 passed (2)
      Tests  4 passed (4)
   Start at  23:30:48
   Duration  665ms (transform 218ms, setup 0ms, collect 478ms, tests 27ms, environment 0ms, prepare 165ms)
```

## Real MCP Refresh Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp runtime root and temp modpack workspace.
# Calls executeMcpServerRequest with inventory, refresh inventory, then inventory again.
# Prints persistentCache metadata from each response.
TS
```

Output:

```json
{
  "first": {
    "hit": false,
    "reason": "miss",
    "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-refresh-riIrb1/caches/mod-archives/mod-archive-inventory.sqlite",
    "cacheKey": "13c6da97e4c8ba891daf0b6d808c2461e23ba073f50a48dc45c629e5dce3e2bd",
    "archiveFingerprintCount": 1
  },
  "refresh": {
    "hit": false,
    "reason": "refresh",
    "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-refresh-riIrb1/caches/mod-archives/mod-archive-inventory.sqlite",
    "cacheKey": "13c6da97e4c8ba891daf0b6d808c2461e23ba073f50a48dc45c629e5dce3e2bd",
    "archiveFingerprintCount": 1
  },
  "second": {
    "hit": true,
    "reason": "hit",
    "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-refresh-riIrb1/caches/mod-archives/mod-archive-inventory.sqlite",
    "cacheKey": "13c6da97e4c8ba891daf0b6d808c2461e23ba073f50a48dc45c629e5dce3e2bd",
    "archiveFingerprintCount": 1
  },
  "archiveCount": 1
}
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
      Tests  289 passed (289)
   Start at  23:32:08
   Duration  3.46s (transform 4.23s, setup 0ms, collect 18.09s, tests 8.62s, environment 10ms, prepare 7.31s)
```
