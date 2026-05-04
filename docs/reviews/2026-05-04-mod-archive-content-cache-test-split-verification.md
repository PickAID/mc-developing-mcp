# Mod Archive Content Cache Test Split Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice splits cache reuse coverage out of
`apps/mcp-server/src/mod-archive-content-executor.test.ts` into
`apps/mcp-server/src/mod-archive-content-cache.test.ts`.

Reason: `mod-archive-content-executor.test.ts` had reached 496 lines. It was
still under the 500-line limit, but any future crash/modpack regression test
would likely violate the maintainability guard.

## Red
This is a maintainability split, not a new behavior slice. The pre-change risk
was the near-limit test file:

```text
496 apps/mcp-server/src/mod-archive-content-executor.test.ts
```

The behavior under protection is cache reuse for repeated inventory and list
requests through `createMcpServerModArchiveContentExecutor`.

## Green
Focused regression group:

```bash
pnpm vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/mod-archive-content-cache.test.ts
```

Result:

```text
✓ apps/mcp-server/src/mod-archive-content-cache.test.ts (2 tests) 9ms
✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (9 tests) 28ms

Test Files  2 passed (2)
Tests  11 passed (11)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  129 passed (129)
Tests  414 passed (414)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Value
Inventory cache reuse first call:

```json
{
  "payload": {
    "mode": "inventory",
    "cache": {
      "archiveInspectionHits": 0,
      "archiveInspectionMisses": 1,
      "centralDirectoryHits": 0,
      "centralDirectoryMisses": 1
    }
  }
}
```

Inventory cache reuse second call:

```json
{
  "payload": {
    "mode": "inventory",
    "cache": {
      "archiveInspectionHits": 1,
      "archiveInspectionMisses": 0,
      "centralDirectoryHits": 0,
      "centralDirectoryMisses": 0
    }
  }
}
```

List cache reuse first call:

```json
{
  "payload": {
    "mode": "list",
    "cache": {
      "centralDirectoryHit": false
    }
  }
}
```

List cache reuse second call:

```json
{
  "payload": {
    "mode": "list",
    "cache": {
      "centralDirectoryHit": true
    }
  }
}
```

Injected cache size after repeated list requests:

```json
{
  "centralDirectories": 1
}
```

## Line Counts
Before:

```text
496 apps/mcp-server/src/mod-archive-content-executor.test.ts
```

After:

```text
434 apps/mcp-server/src/mod-archive-content-executor.test.ts
215 apps/mcp-server/src/mod-archive-content-cache.test.ts
```

## Notes
- Public MCP tools are unchanged.
- This split keeps cache-specific fixtures isolated so future archive, crash,
  metadata, datapack, and resourcepack tests can grow without turning the
  executor test file into a mixed responsibility file.
