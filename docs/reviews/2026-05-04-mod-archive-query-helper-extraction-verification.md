# Mod Archive Query Helper Extraction Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice extracts mod archive query and domain helper logic out of
`mod-archive-content-executor.ts`.

Reason: `mod-archive-content-executor.ts` had reached 492 lines, close to the
500-line source limit. Keeping query extraction in the executor would make the
next crash/modpack addition risky and harder to maintain.

## Red
Focused red test:

```bash
pnpm vitest run apps/mcp-server/src/mod-archive-content-query.test.ts
```

Observed failure before implementation:

```text
FAIL apps/mcp-server/src/mod-archive-content-query.test.ts
Error: Cannot find module './mod-archive-content-query.js'
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/mod-archive-content-query.test.ts
```

Result:

```text
✓ apps/mcp-server/src/mod-archive-content-query.test.ts (2 tests) 1ms

Test Files  1 passed (1)
Tests  2 passed (2)
```

Related regression group:

```bash
pnpm vitest run apps/mcp-server/src/mod-archive-content-query.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/mod-archive-metadata-content.test.ts apps/mcp-server/src/request-executor-metadata-crash.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests  15 passed (15)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  128 passed (128)
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
Command:

```bash
pnpm tsx -e '...extractModArchiveQueries/extractListDomains sample...'
```

Return value:

```json
{
  "queries": [
    "demo.mixins.json",
    "during",
    "Mixin",
    "apply"
  ],
  "listDomains": [
    "data",
    "assets",
    "java",
    "class",
    "metadata"
  ],
  "searchDomains": [
    "data",
    "assets",
    "java",
    "class",
    "metadata"
  ]
}
```

## Line Counts
Before:

```text
492 apps/mcp-server/src/mod-archive-content-executor.ts
```

After:

```text
421 apps/mcp-server/src/mod-archive-content-executor.ts
81 apps/mcp-server/src/mod-archive-content-query.ts
23 apps/mcp-server/src/mod-archive-content-query.test.ts
```

## Notes
- This refactor intentionally keeps public MCP tools unchanged.
- Query extraction still prioritizes explicit archive/resource paths before
  loose natural-language words.
- `mod-archive-content-executor.test.ts` remains at 496 lines and should be
  split before adding more tests to that file.
