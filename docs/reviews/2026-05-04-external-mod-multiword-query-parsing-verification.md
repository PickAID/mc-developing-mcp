# External Mod Multiword Query Parsing Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice improves natural-language external mod request parsing when the user
does not write a `for <mod name>` phrase.

Before this change, fallback parsing kept only the first meaningful token. A
request such as `Find the CurseForge mod Just Enough Items forge 1.20.1.` became
`query = "just"`, which is too broad and causes remote search ambiguity or false
project exploration.

Fallback parsing now preserves the meaningful token phrase before known loader
and Minecraft version constraints.

## Red
Focused red test:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts -t "multi-word natural mod names"
```

Observed failure before implementation:

```text
× parseExternalModRequest > keeps multi-word natural mod names before loader and version constraints
  → expected query "just enough items" but received "just"
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (7 tests) 3ms

Test Files  1 passed (1)
Tests  7 passed (7)
```

Related external mod executor regression:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (7 tests) 6ms

Test Files  1 passed (1)
Tests  7 passed (7)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  124 passed (124)
Tests  405 passed (405)
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
pnpm tsx -e '...parseExternalModRequest fixture...'
```

Return value:

```json
[
  {
    "text": "Find the CurseForge mod Just Enough Items forge 1.20.1.",
    "parsed": {
      "platform": "curseforge",
      "query": "just enough items",
      "loader": "forge",
      "minecraftVersion": "1.20.1"
    }
  },
  {
    "text": "Find the CurseForge mod energy forge 1.20.1.",
    "parsed": {
      "platform": "curseforge",
      "query": "energy",
      "loader": "forge",
      "minecraftVersion": "1.20.1"
    }
  },
  {
    "text": "Find CurseMaven for project id 238222 forge 1.20.1.",
    "parsed": {
      "platform": "curseforge",
      "projectId": "238222",
      "query": "238222",
      "loader": "forge",
      "minecraftVersion": "1.20.1"
    }
  }
]
```

## Notes
- URL, explicit slug, and explicit project-id parsing still take priority over
  fallback phrase parsing.
- This improves query quality for common names like `Just Enough Items`,
  `Architectury API`, or `Cloth Config` without weakening remote ambiguity
  protection.
