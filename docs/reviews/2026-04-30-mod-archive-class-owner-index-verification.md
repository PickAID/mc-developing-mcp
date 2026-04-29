# Mod Archive Class Owner Index Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Class owner lookup can now use the persistent mod archive entry index.

- `findCachedModArchiveClassOwners` resolves top-level `.class` owners from the SQLite entry index.
- MCP class-owner requests prefer the persistent entry index when `runtimeRoot` is available.
- If the persistent index has no match, MCP falls back to the existing archive/JarJar scanner so nested JarJar behavior is preserved.
- Matches now include `archiveRelativePath`, which is more useful for modpack triage than an absolute temp path alone.
- The public MCP surface remains one progressive tool, `mc_develop`.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-class-owner-index.test.ts apps/mcp-server/src/mod-archive-class-owner-index.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 FAIL  packages/jar-source-adapter/src/mod-archive-class-owner-index.test.ts
Error: Cannot find module './mod-archive-class-owner-index.js'

 FAIL  apps/mcp-server/src/mod-archive-class-owner-index.test.ts
-       "entryIndex": {
-         "archiveHits": 0,
-         "archiveMisses": 1,
-       },
+       "centralDirectoryHits": 0,
+       "centralDirectoryMisses": 1,

 Test Files  2 failed (2)
      Tests  1 failed (1)
   Start at  00:15:13
   Duration  930ms (transform 193ms, setup 0ms, collect 406ms, tests 319ms, environment 0ms, prepare 116ms)
```

## GREEN Output
Command:

```bash
pnpm typecheck
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-class-owner-index.test.ts apps/mcp-server/src/mod-archive-class-owner-index.test.ts
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false

 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archive-class-owner-index.test.ts (1 test) 13ms
 ✓ apps/mcp-server/src/mod-archive-class-owner-index.test.ts (1 test) 324ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  00:17:27
   Duration  989ms (transform 216ms, setup 0ms, collect 467ms, tests 337ms, environment 0ms, prepare 146ms)
```

## Real MCP Class Owner Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp runtime root and temp modpack workspace.
# Calls executeMcpServerRequest twice with a class owner request.
# Prints cache metadata and the selected class-owner match.
TS
```

Output:

```json
{
  "first": {
    "entryIndex": {
      "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-class-owner-runtime-kTjX6e/caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 0,
      "archiveMisses": 1,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "second": {
    "entryIndex": {
      "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-class-owner-runtime-kTjX6e/caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 1,
      "archiveMisses": 0,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "match": {
    "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-class-owner-workspace-Ls5XR1/mods/problem-mod.jar",
    "archiveRelativePath": "mods/problem-mod.jar",
    "requestedClassName": "com.example.problem.CrashHandler",
    "binaryName": "com.example.problem.CrashHandler",
    "relativePath": "com/example/problem/CrashHandler.class",
    "sizeBytes": 4,
    "matchKind": "exact"
  }
}
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

 Test Files  97 passed (97)
      Tests  293 passed (293)
   Start at  00:18:31
   Duration  2.80s (transform 3.12s, setup 0ms, collect 14.17s, tests 8.13s, environment 9ms, prepare 5.51s)
```
