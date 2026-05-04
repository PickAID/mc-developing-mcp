# Evidence Plan Resource-Pack Provenance Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice finishes the resource-pack semantics split at the evidence-plan
layer.

`resource_pack_lookup` still uses the existing `datapack_files` route step and
source-bundle executor, but evidence candidates now report
`resource_pack_files` provenance and resource-pack wording for `assets/**`
requests.

The public MCP tool surface is unchanged.

## Red
Focused red command:

```bash
pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts
```

Observed failures before implementation:

```text
× buildMcpServerEvidencePlan > marks vanilla asset requests as generated vanilla assets evidence
  → expected provenance 'resource_pack_files' but received 'datapack_files'

× buildMcpServerEvidencePlan > marks local assets paths as resource-pack file evidence
  → expected provenance 'resource_pack_files' but received 'datapack_files'
  → expected reason 'Inspect resource-pack assets before secondary docs.'
    but received 'Inspect datapack files before secondary docs.'
```

## Green
Focused green:

```bash
pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts
```

Result:

```text
✓ apps/mcp-server/src/evidence-plan.test.ts (9 tests) 12ms

Test Files  1 passed (1)
Tests  9 passed (9)
```

Related MCP source-bundle focused check:

```bash
pnpm exec vitest run apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts apps/mcp-server/src/source-bundle-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts (2 tests) 23ms
✓ apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts (2 tests) 40ms
✓ apps/mcp-server/src/source-bundle-executor.test.ts (5 tests) 49ms
✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (5 tests) 54ms

Test Files  5 passed (5)
Tests  16 passed (16)
```

Typecheck:

```bash
pnpm typecheck
```

Result: `tsc -b --pretty false` exited with code 0.

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  132 passed (132)
Tests  425 passed (425)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: all three guard commands produced no output.

## Actual Return Value
Command:

```bash
pnpm tsx <<'TS'
// creates a temporary assets-only workspace with
// assets/demo/blockstates/gear.json, then builds request/evidence plans for:
// Trace references for assets/demo/blockstates/gear.json.
TS
```

Returned value:

```json
{
  "taskIntent": {
    "id": "resource_pack_lookup",
    "confidence": "high",
    "reasons": [
      "request text mentions resource-pack asset keywords or assets path",
      "workspace snapshot exposes resource-pack asset content"
    ]
  },
  "routeSteps": ["datapack_files", "docs_lookup"],
  "candidates": [
    {
      "id": "candidate-1-datapack_files",
      "routeStep": "datapack_files",
      "provenance": "resource_pack_files",
      "preferredTool": "source.bundle",
      "reason": "Inspect resource-pack assets before secondary docs.",
      "pathHints": [
        "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-resource-evidence-ovcl8y"
      ]
    },
    {
      "id": "candidate-2-docs_lookup",
      "routeStep": "docs_lookup",
      "provenance": "docs",
      "preferredTool": "context.query",
      "reason": "Use docs only after exact workspace or typed evidence.",
      "pathHints": []
    }
  ]
}
```

## Line Counts
Current relevant line counts:

```text
370 apps/mcp-server/src/evidence-plan.ts
472 apps/mcp-server/src/evidence-plan.test.ts
```

## Notes
- This does not create a `resource_pack_files` route step.
- The executor dispatch remains `datapack_files` for now because that executor
  already handles `data/**` and `assets/**`.
- `apps/mcp-server/src/evidence-plan.test.ts` is now close to 500 lines; the
  next evidence-plan test slice should split fixtures or resource-pack coverage
  before adding more cases.
