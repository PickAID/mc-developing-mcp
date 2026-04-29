# Package Output Verification
Date: 2026-04-29
Author: m1hono
Scope: workspace package metadata, final npm pack output

## Result
Workspace packages now explicitly package only built `dist` output.

- Every `apps/*/package.json` and `packages/*/package.json` declares `files: ["dist"]`.
- Every workspace package declares a placeholder semver `version: "0.0.0"` so `npm pack --dry-run` can validate package contents.
- TypeScript builds already exclude `src/**/*.test.ts`; this change also prevents raw source tests from entering npm pack output.
- Release workflows can replace `0.0.0` later without changing the package-output guard.

## RED Output
Command:

```bash
pnpm exec vitest run tests/monorepo/package-output.test.ts
```

Initial failure for missing `files` allowlist:

```text
FAIL  tests/monorepo/package-output.test.ts > workspace package output > packs only dist files from app and package workspaces
AssertionError: @mcpskill/agent-runtime: expected undefined to deeply equal [ 'dist' ]
```

Second failure after adding the `files` check and requiring a packable version:

```text
FAIL  tests/monorepo/package-output.test.ts > workspace package output > packs only dist files from app and package workspaces
TypeError: .toMatch() expects to receive a string, but got undefined
```

## GREEN Output
Command:

```bash
pnpm exec vitest run tests/monorepo/package-output.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ tests/monorepo/package-output.test.ts (1 test) 2ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  21:58:48
   Duration  225ms (transform 15ms, setup 0ms, collect 14ms, tests 2ms, environment 0ms, prepare 52ms)
```

## Real Pack Dry Run
Command:

```bash
node <<'JS'
# Iterates apps/* and packages/*.
# Runs npm pack --dry-run --json in each workspace.
# Fails if any packed path contains src/ or .test.
JS
```

Output:

```json
{
  "checked": 20,
  "failures": [],
  "summaries": [
    { "workspace": "apps/agent-runtime", "entryCount": 9, "size": 1729 },
    { "workspace": "apps/mcp-server", "entryCount": 137, "size": 62361 },
    { "workspace": "packages/agent-harness", "entryCount": 41, "size": 11537 },
    { "workspace": "packages/datapack-adapter", "entryCount": 25, "size": 7366 },
    { "workspace": "packages/docs-retrieval", "entryCount": 25, "size": 9308 },
    { "workspace": "packages/eval-harness", "entryCount": 5, "size": 532 },
    { "workspace": "packages/gradle-adapter", "entryCount": 21, "size": 8803 },
    { "workspace": "packages/jar-source-adapter", "entryCount": 49, "size": 22660 },
    { "workspace": "packages/java-jdtls-adapter", "entryCount": 61, "size": 20521 },
    { "workspace": "packages/kubejs-language-service", "entryCount": 29, "size": 8346 },
    { "workspace": "packages/kubejs-types-adapter", "entryCount": 49, "size": 15479 },
    { "workspace": "packages/package-registry", "entryCount": 9, "size": 1359 },
    { "workspace": "packages/resource-registry", "entryCount": 29, "size": 9595 },
    { "workspace": "packages/runtime-manager", "entryCount": 13, "size": 1375 },
    { "workspace": "packages/service-profile", "entryCount": 21, "size": 6049 },
    { "workspace": "packages/shared-types", "entryCount": 21, "size": 5226 },
    { "workspace": "packages/source-index", "entryCount": 33, "size": 8290 },
    { "workspace": "packages/source-package-manager", "entryCount": 45, "size": 9446 },
    { "workspace": "packages/vanilla-source-adapter", "entryCount": 17, "size": 4861 },
    { "workspace": "packages/workspace-detector", "entryCount": 29, "size": 12612 }
  ]
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
   Start at  22:00:04
   Duration  2.72s (transform 3.47s, setup 0ms, collect 14.33s, tests 6.28s, environment 19ms, prepare 5.98s)
```
