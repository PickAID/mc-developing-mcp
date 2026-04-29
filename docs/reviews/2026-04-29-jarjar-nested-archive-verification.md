# JarJar Nested Archive Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Mod archive search now includes one-level JarJar nested jars.

- `searchArchiveSetContent` searches `.jar` entries embedded inside discovered mod jars.
- `findArchiveSetClassOwners` locates class owners inside embedded jars.
- Nested matches include `embeddedArchivePath`.
- If the embedded jar has Fabric, Quilt, Forge, or NeoForge metadata, matches include `embeddedArchiveMetadata`.
- The MCP public surface remains one progressive tool, `mc_develop`.
- Nested scanning is bounded to one level and a limited number/size of embedded jars to avoid runaway work.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/archive-set.test.ts packages/jar-source-adapter/src/class-owner.test.ts -t "JarJar"
```

Initial failure:

```text
FAIL packages/jar-source-adapter/src/archive-set.test.ts > mod archive discovery and search > searches one-level JarJar nested archives with embedded metadata

Expected a match with:
embeddedArchivePath: "META-INF/jarjar/nested-content.jar"
entry.relativePath: "data/demo/recipes/nested_gear.json"

Actual matches: []

FAIL packages/jar-source-adapter/src/class-owner.test.ts > findArchiveSetClassOwners > locates class owners inside one-level JarJar nested archives

Expected a class-owner match with:
embeddedArchivePath: "META-INF/jarjar/nested-lib.jar"
binaryName: "com.example.nested.NestedCrash"

Actual matches: []
```

MCP entry RED:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts -t "JarJar"
```

Initial MCP failure:

```text
Expected mod_archive_content to select a match from META-INF/jarjar/nested-content.jar.
Actual result was matched: false with matches: [].
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - logs/latest.log containing demo:nested_gear
# - mods/outer-mod.jar containing META-INF/jarjar/nested-content.jar
# - nested-content.jar containing fabric.mod.json and data/demo/recipes/nested_gear.json
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
      "relativePath": "data/demo/recipes/nested_gear.json",
      "domain": "data",
      "sizeBytes": 30
    },
    "line": 1,
    "column": 12,
    "preview": "{\"result\":\"demo:nested_gear\"}",
    "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-jarjar-v6rxs6/mods/outer-mod.jar",
    "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
    "embeddedArchiveMetadata": {
      "loader": "fabric",
      "modId": "nested_content",
      "name": "Nested Content",
      "version": "2.0.0",
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

 ✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 6ms
 ✓ packages/jar-source-adapter/src/mod-archives.test.ts (1 test) 5ms
 ✓ packages/jar-source-adapter/src/class-owner.test.ts (3 tests) 5ms
 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 14ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (3 tests) 13ms

 Test Files  5 passed (5)
      Tests  12 passed (12)
   Start at  18:42:59
   Duration  261ms (transform 111ms, setup 0ms, collect 191ms, tests 43ms, environment 0ms, prepare 281ms)
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts packages/jar-source-adapter/src/archive-set.test.ts packages/jar-source-adapter/src/class-owner.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/class-owner.test.ts (3 tests) 7ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (3 tests) 14ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (6 tests) 22ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 22ms

 Test Files  4 passed (4)
      Tests  17 passed (17)
   Start at  18:43:09
   Duration  625ms (transform 296ms, setup 0ms, collect 646ms, tests 65ms, environment 0ms, prepare 265ms)
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
      Tests  268 passed (268)
   Start at  18:43:32
   Duration  2.37s (transform 2.47s, setup 0ms, collect 11.47s, tests 5.68s, environment 8ms, prepare 6.16s)
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
