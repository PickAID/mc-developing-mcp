# Explicit External Mod Constraint Routing Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that follow-up text after an ambiguous remote result can carry exact constraints. The MCP parser should understand `slug <value>` and `project id <value>`, and the external mod executor should pass CurseForge `projectId` through to the resolver.

## TDD Red
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts
```

Observed failures before implementation:

```text
FAIL  apps/mcp-server/src/external-mod-resolution-request.test.ts > parseExternalModRequest > extracts an explicit CurseForge slug constraint
-   "query": "jei",
-   "slug": "jei",
+   "query": "slug jei",
+   "slug": undefined,

FAIL  apps/mcp-server/src/external-mod-resolution-request.test.ts > parseExternalModRequest > extracts an explicit CurseForge project id constraint
-   "projectId": "238222",
-   "query": "238222",
+   "query": "project id 238222",

FAIL  apps/mcp-server/src/external-mod-resolution-executor.test.ts > executeMcpServerExternalModResolution > passes explicit CurseForge project ids to the resolver
-   "projectId": "238222",
-   "query": "238222",
+   "query": "project id 238222",
```

This confirmed exact follow-up constraints were treated as broad query text.

## Local Green
Commands:

```bash
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Observed result:

```text
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (6 tests)
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (6 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (4 tests)
Test Files  3 passed (3)
Tests  16 passed (16)
```

## Actual Return Values
The following output was produced through `pnpm exec tsx` by parsing and executing explicit slug and project-id requests.

```json
{
  "parsedSlug": {
    "platform": "curseforge",
    "slug": "jei",
    "query": "jei",
    "loader": "forge",
    "minecraftVersion": "1.20.1"
  },
  "parsedProjectId": {
    "platform": "curseforge",
    "projectId": "238222",
    "query": "238222",
    "loader": "forge",
    "minecraftVersion": "1.20.1"
  },
  "slugExecution": {
    "matched": true,
    "payload": {
      "source": "external_mod_resolution",
      "request": {
        "platform": "curseforge",
        "slug": "jei",
        "query": "jei",
        "loader": "forge",
        "minecraftVersion": "1.20.1"
      }
    }
  },
  "projectIdExecution": {
    "matched": true,
    "payload": {
      "source": "external_mod_resolution",
      "request": {
        "platform": "curseforge",
        "projectId": "238222",
        "query": "238222",
        "loader": "forge",
        "minecraftVersion": "1.20.1"
      }
    }
  }
}
```

## Full Verification
Commands:

```bash
pnpm typecheck
pnpm test
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed result:

```text
pnpm typecheck: passed
pnpm test: 117 test files passed, 386 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
