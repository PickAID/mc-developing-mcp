# External Mod URL Request Parsing Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that MCP external mod resolution can parse Modrinth and CurseForge project/file URLs into exact platform + slug requests. This avoids wasting resolver calls on URL scheme or host tokens such as `https`, `www`, or `modrinth`.

## TDD Red
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts
```

Observed failures before implementation:

```text
FAIL  apps/mcp-server/src/external-mod-resolution-request.test.ts > parseExternalModRequest > extracts a Modrinth slug from a project URL
-   "query": "sodium",
+   "query": "https",

FAIL  apps/mcp-server/src/external-mod-resolution-request.test.ts > parseExternalModRequest > extracts a CurseForge slug from a project URL
-   "query": "jei",
+   "query": "https://www",
```

This confirmed that URL input was being routed through generic token extraction instead of source-specific URL parsing.

## Local Green
Commands:

```bash
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Observed result:

```text
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (4 tests)
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (3 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (4 tests)
Test Files  3 passed (3)
Tests  11 passed (11)
```

## Actual Return Values
The following output was produced by directly calling `parseExternalModRequest` through `pnpm exec tsx`.

```json
[
  {
    "input": "Resolve https://modrinth.com/mod/sodium for fabric 1.20.1.",
    "request": {
      "platform": "modrinth",
      "query": "sodium",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    }
  },
  {
    "input": "Find maven info for https://modrinth.com/mod/sodium/version/OihdIimA fabric 1.20.1.",
    "request": {
      "platform": "modrinth",
      "query": "sodium",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    }
  },
  {
    "input": "Find CurseMaven for https://www.curseforge.com/minecraft/mc-mods/jei forge 1.20.1.",
    "request": {
      "platform": "curseforge",
      "query": "jei",
      "loader": "forge",
      "minecraftVersion": "1.20.1"
    }
  },
  {
    "input": "Resolve https://www.curseforge.com/minecraft/mc-mods/jei/files/5528825 for forge 1.20.1.",
    "request": {
      "platform": "curseforge",
      "query": "jei",
      "loader": "forge",
      "minecraftVersion": "1.20.1"
    }
  }
]
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
pnpm test: 117 test files passed, 379 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
