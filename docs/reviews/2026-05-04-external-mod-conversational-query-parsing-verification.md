# External Mod Conversational Query Parsing Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice removes common conversational lead-in words from fallback external mod
query parsing. Without this, a request such as:

```text
Can you please find the Modrinth mod Architectury API fabric 1.20.1?
```

was parsed as `can you please architectury api`, which makes remote API lookup
less precise and wastes the agent's search path.

## Red
Focused red test:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts -t "conversational lead-in"
```

Observed failure before implementation:

```text
× parseExternalModRequest > drops conversational lead-in words from natural mod names
  → expected query "architectury api" but received "can you please architectury api"
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (8 tests) 3ms

Test Files  1 passed (1)
Tests  8 passed (8)
```

Related external mod executor regression:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (7 tests) 5ms

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
Tests  406 passed (406)
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
    "text": "Can you please find the Modrinth mod Architectury API fabric 1.20.1?",
    "parsed": {
      "platform": "modrinth",
      "query": "architectury api",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    }
  },
  {
    "text": "I need the CurseForge mod Just Enough Items forge 1.20.1.",
    "parsed": {
      "platform": "curseforge",
      "query": "just enough items",
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
- The stop words are intentionally limited to conversational wrappers such as
  `can`, `you`, `please`, `i`, `need`, and `get`.
- Mod names containing important technical words such as `api` are still
  preserved.
