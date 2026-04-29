# Mod Archive Entry Index Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Modpack JAR entry indexing now has a SQLite-backed bottom layer.

- `queryCachedModArchiveEntries` persists top-level mod JAR entries by archive fingerprint.
- The index records source archive, workspace-relative archive path, entry path, domain, and size.
- Supported entry domains are `data`, `assets`, `java`, and `class`.
- Stale archive fingerprints rebuild the indexed entries.
- MCP inventory requests build/query this index with `limit: 0`, so the payload exposes counts and cache state without dumping every path into context.
- The public MCP surface remains one progressive tool, `mc_develop`.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 FAIL  packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
Error: Cannot find module './mod-archive-entry-index.js'

 Test Files  1 failed (1)
      Tests  no tests
   Start at  00:05:01
   Duration  224ms (transform 27ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 80ms)
```

MCP integration RED:

```text
Expected payload.entryIndex cache metadata.
Actual payload included inventory persistentCache but no entryIndex field.
```

## GREEN Output
Command:

```bash
pnpm typecheck
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false

 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (2 tests) 17ms
 ✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (2 tests) 22ms

 Test Files  2 passed (2)
      Tests  4 passed (4)
   Start at  00:09:28
   Duration  595ms (transform 174ms, setup 0ms, collect 389ms, tests 39ms, environment 0ms, prepare 142ms)
```

## Real MCP Entry Index Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp runtime root and temp modpack workspace.
# Calls executeMcpServerRequest twice with an inventory/index request.
# Prints compact entryIndex metadata from both responses.
TS
```

Output:

```json
{
  "first": {
    "archiveCount": 1,
    "entryCount": 2,
    "truncated": true,
    "cache": {
      "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-entry-index-runtime-fe8bqc/caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 0,
      "archiveMisses": 1,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "second": {
    "archiveCount": 1,
    "entryCount": 2,
    "truncated": true,
    "cache": {
      "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-entry-index-runtime-fe8bqc/caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 1,
      "archiveMisses": 0,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "persistentCache": {
    "hit": true,
    "reason": "hit",
    "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-entry-index-runtime-fe8bqc/caches/mod-archives/mod-archive-inventory.sqlite",
    "cacheKey": "fec7f4b29743c55c460973b8ed25ffbf1791a47f845fb81dba1bf57e36d1b107",
    "archiveFingerprintCount": 1
  }
}
```

`truncated: true` is expected for MCP inventory payloads because the executor intentionally queries with `limit: 0`; it returns the total count and cache state, not the full path list.

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

 Test Files  95 passed (95)
      Tests  291 passed (291)
   Start at  00:10:40
   Duration  2.72s (transform 3.09s, setup 0ms, collect 13.04s, tests 6.94s, environment 8ms, prepare 7.00s)
```
