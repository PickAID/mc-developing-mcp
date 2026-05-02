# External Mod Ambiguous Project Routing Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that broad Modrinth and CurseForge project search results do not silently select the first remote hit. The resolver should return a compact `ambiguous_project_match` warning with project hints and no jar/version/file follow-up request.

## TDD Red
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts
```

Observed failure before implementing Modrinth project-id identity matching:

```text
FAIL  packages/external-mod-resolver/src/modrinth.test.ts > resolveModrinthMod > uses an exact Modrinth project id match instead of reporting ambiguity
AssertionError: expected [ Array(1) ] to have a length of 2 but got 1
```

This confirmed that the resolver stopped after the search request and treated an exact `project_id` match as ambiguous.

## Local Green
Commands:

```bash
pnpm exec tsc -b packages/external-mod-resolver --pretty false
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts packages/external-mod-resolver/src/curseforge.test.ts
```

Observed result:

```text
✓ packages/external-mod-resolver/src/curseforge.test.ts (3 tests)
✓ packages/external-mod-resolver/src/modrinth.test.ts (4 tests)
Test Files  2 passed (2)
Tests  7 passed (7)
```

## Actual Return Values
The following output was produced by directly calling the resolver functions with fixture fetch implementations through `pnpm exec tsx`.

```json
{
  "modrinthRequests": [
    "https://api.modrinth.com/v2/search?query=energy&limit=5&facets=%5B%5B%22project_type%3Amod%22%5D%2C%5B%22categories%3Afabric%22%5D%2C%5B%22versions%3A1.20.1%22%5D%5D"
  ],
  "modrinth": {
    "source": "modrinth",
    "query": "energy",
    "candidates": [],
    "warnings": [
      {
        "code": "ambiguous_project_match",
        "message": "Modrinth query energy matched multiple projects; choose an exact slug or project id.",
        "projectHints": [
          {
            "source": "modrinth",
            "projectId": "project-a",
            "slug": "energy-api",
            "title": "Energy API",
            "downloads": 3000
          },
          {
            "source": "modrinth",
            "projectId": "project-b",
            "slug": "energy-control",
            "title": "Energy Control",
            "downloads": 2000
          },
          {
            "source": "modrinth",
            "projectId": "project-c",
            "slug": "energized-power",
            "title": "Energized Power",
            "downloads": 1000
          }
        ]
      }
    ]
  },
  "curseForgeRequests": [
    "https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&pageSize=5&searchFilter=energy"
  ],
  "curseForge": {
    "source": "curseforge",
    "query": "energy",
    "candidates": [],
    "warnings": [
      {
        "code": "ambiguous_project_match",
        "message": "CurseForge query energy matched multiple projects; choose an exact slug or project id.",
        "projectHints": [
          {
            "source": "curseforge",
            "projectId": "1001",
            "slug": "energy-api",
            "title": "Energy API"
          },
          {
            "source": "curseforge",
            "projectId": "1002",
            "slug": "energy-control",
            "title": "Energy Control"
          }
        ]
      }
    ]
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
pnpm test: 116 test files passed, 374 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
