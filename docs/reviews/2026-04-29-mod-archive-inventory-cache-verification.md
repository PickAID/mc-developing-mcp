# Mod Archive Inventory Cache Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Mod archive inventory now caches the full per-archive inspection result.

- `ArchiveContentCache` has an `archiveInspections` cache bucket.
- Inventory inspection cache keys include the archive fingerprint and `maxNestedArchives`.
- Repeated inventory requests can reuse archive metadata, content summaries, and JarJar nested summaries.
- On an inspection cache hit, inventory no longer re-reads the archive central directory.
- Cache size now reports `centralDirectories`, `textFiles`, and `archiveInspections`.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts
```

Initial failure:

```text
Expected cache metadata to include archiveInspectionHits and archiveInspectionMisses.
Actual cache metadata only included centralDirectoryHits and centralDirectoryMisses.
```

## GREEN Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts packages/jar-source-adapter/src/archive-content.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 13ms
 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 12ms

 Test Files  2 passed (2)
      Tests  7 passed (7)
   Start at  22:25:30
   Duration  253ms (transform 62ms, setup 0ms, collect 72ms, tests 25ms, environment 0ms, prepare 150ms)
```

## Targeted Regression Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts packages/jar-source-adapter/src/archive-content.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 18ms
 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 12ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (11 tests) 37ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 32ms
 ✓ apps/mcp-server/src/context-query-executor.test.ts (4 tests) 157ms

 Test Files  5 passed (5)
      Tests  27 passed (27)
   Start at  22:27:55
   Duration  687ms (transform 519ms, setup 0ms, collect 1.08s, tests 256ms, environment 0ms, prepare 267ms)
```

## Real MCP Cache Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with one outer mod jar and one nested JarJar.
# Calls executeMcpServerRequest twice with the same ArchiveContentCache.
# Prints the first cache metadata, second cache metadata, and cache.size().
TS
```

Output:

```json
{
  "firstCache": {
    "archiveInspectionHits": 0,
    "archiveInspectionMisses": 1,
    "centralDirectoryHits": 0,
    "centralDirectoryMisses": 1
  },
  "secondCache": {
    "archiveInspectionHits": 1,
    "archiveInspectionMisses": 0,
    "centralDirectoryHits": 0,
    "centralDirectoryMisses": 0
  },
  "cacheSize": {
    "centralDirectories": 1,
    "textFiles": 0,
    "archiveInspections": 1
  }
}
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

## Final Test Output
Command:

```bash
pnpm test
```

Output:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  92 passed (92)
      Tests  285 passed (285)
   Start at  22:28:32
   Duration  2.63s (transform 3.65s, setup 0ms, collect 14.63s, tests 6.17s, environment 9ms, prepare 5.72s)
```
