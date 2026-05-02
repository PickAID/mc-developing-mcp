# CurseForge Broad Query Routing Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that MCP external mod execution does not invent exact CurseForge slugs from ordinary one-word search terms. A broad query such as `energy` should be passed as `query` only so the resolver can return `ambiguous_project_match`. URL-derived slugs such as `https://www.curseforge.com/minecraft/mc-mods/jei` should still be passed as exact `slug` constraints.

## TDD Red
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts
```

Observed failures before implementation:

```text
FAIL  apps/mcp-server/src/external-mod-resolution-executor.test.ts > executeMcpServerExternalModResolution > passes broad CurseForge queries without a slug so ambiguity can be reported
AssertionError: expected 'energy' to be undefined

FAIL  apps/mcp-server/src/external-mod-resolution-executor.test.ts > executeMcpServerExternalModResolution > passes CurseForge URL slugs as exact slug constraints
-       "slug": "jei",
```

This confirmed two problems: broad single-token queries were treated as slugs, and URL-derived slug evidence was not preserved in the request payload.

## Local Green
Commands:

```bash
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Observed result:

```text
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (4 tests)
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (5 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (4 tests)
Test Files  3 passed (3)
Tests  13 passed (13)
```

## Actual Return Values
The following output was produced through `pnpm exec tsx` by parsing and executing a broad query and a URL-backed exact slug request.

```json
{
  "parsedBroad": {
    "platform": "curseforge",
    "query": "energy",
    "loader": "forge",
    "minecraftVersion": "1.20.1"
  },
  "parsedUrl": {
    "platform": "curseforge",
    "slug": "jei",
    "query": "jei",
    "loader": "forge",
    "minecraftVersion": "1.20.1"
  },
  "broadExecution": {
    "matched": true,
    "summary": "broad query energy preserved without slug",
    "payload": {
      "source": "external_mod_resolution",
      "request": {
        "platform": "curseforge",
        "query": "energy",
        "loader": "forge",
        "minecraftVersion": "1.20.1"
      },
      "result": {
        "source": "curseforge",
        "query": "energy",
        "candidates": [],
        "warnings": [
          {
            "code": "ambiguous_project_match",
            "message": "broad query energy preserved without slug"
          }
        ]
      }
    }
  },
  "urlExecution": {
    "matched": true,
    "summary": "exact slug jei would require CURSEFORGE_API_KEY Set CURSEFORGE_API_KEY before retrying.",
    "payload": {
      "source": "external_mod_resolution",
      "request": {
        "platform": "curseforge",
        "slug": "jei",
        "query": "jei",
        "loader": "forge",
        "minecraftVersion": "1.20.1"
      },
      "result": {
        "source": "curseforge",
        "query": "jei",
        "candidates": [],
        "warnings": [
          {
            "code": "credentials_required",
            "message": "exact slug jei would require CURSEFORGE_API_KEY",
            "credentialEnvVar": "CURSEFORGE_API_KEY"
          }
        ]
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
pnpm test: 117 test files passed, 383 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
