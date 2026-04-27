# Source Bundle Datapack Files Verification
Date: 2026-04-27
Author: m1hono
Scope: `apps/mcp-server` datapack execution path for `source.bundle`

## Change
`source.bundle` now handles the existing internal `datapack_files` route by dispatching to a dedicated datapack executor.

This keeps the public MCP surface progressive: no new public tool is added. The request pipeline can plan `datapack_files -> docs_lookup`, and the executor now inspects local `data/**` and `assets/**` content before falling back to docs.

## RED Test
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Observed failure before implementation:

```text
apps/mcp-server/src/source-bundle-datapack-executor.test.ts > source.bundle datapack execution > searches local datapack files for resource locations before docs
AssertionError: expected { matched: false, ... } to match object { matched: true, payload: ... }
```

This proved the route existed but had no execution support in `source.bundle`.

## Implemented Behavior
- Extracts resource locations such as `demo:gear` from request text.
- Extracts explicit datapack paths such as `data/demo/recipes/gear.json`.
- Discovers local datapack/resource roots through `@mcpskill/datapack-adapter`.
- Searches `data/**` and `assets/**` with a bounded budget.
- Returns compact evidence only: matched files, line/column, preview, skipped files, and truncation state.
- Keeps docs as fallback when no local datapack evidence matches.

## Real Return Value
Command:

```bash
pnpm exec tsx tmp/source-bundle-datapack-smoke.ts
```

Observed result excerpt:

```json
{
  "candidate": {
    "id": "candidate-1-datapack_files",
    "routeStep": "datapack_files",
    "preferredTool": "source.bundle",
    "reason": "Inspect datapack files before secondary docs."
  },
  "result": {
    "matched": true,
    "summary": "Resolved 1 local datapack evidence item(s).",
    "payload": {
      "source": "datapack_files",
      "queries": ["demo:gear"],
      "requestedPaths": [],
      "discovery": {
        "namespaces": ["demo"],
        "dataKinds": ["recipes"],
        "assetKinds": []
      },
      "matches": [
        {
          "file": {
            "relativePath": "data/demo/recipes/gear.json",
            "namespace": "demo",
            "kind": "recipes",
            "domain": "data",
            "sizeBytes": 63
          },
          "line": 1,
          "column": 51,
          "preview": "{ \"type\": \"minecraft:crafting_shaped\", \"result\": \"demo:gear\" }"
        }
      ],
      "skipped": [],
      "truncated": false
    }
  }
}
```

## Verification Commands
```bash
pnpm install --no-frozen-lockfile
pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-executor.test.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

## Verification Results
- `pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-executor.test.ts`: 1 test passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 17 test files passed, 48 tests passed.
- `pnpm test`: 65 test files passed, 209 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.

## Notes
- `pnpm install --frozen-lockfile` correctly failed after adding the workspace dependency because `pnpm-lock.yaml` needed the new `@mcpskill/datapack-adapter` importer entry.
- `pnpm install --no-frozen-lockfile` updated the lockfile without downloading new packages.
