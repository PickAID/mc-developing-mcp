# Harness Resource-Pack Intent Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice splits resource-pack asset requests from datapack requests at the
internal harness intent level.

The public MCP tool surface is unchanged. `resource_pack_lookup` still routes
through the existing `datapack_files` evidence step because the current
source-bundle executor intentionally handles both `data/**` and `assets/**`
resource evidence.

## Red
Focused red command:

```bash
pnpm exec vitest run packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts
```

Observed failures before implementation:

```text
× detectHarnessTaskIntent > detects resource asset lookup requests from assets paths
  → expected { id: 'datapack_lookup', ...(2) } to deeply equal { id: 'resource_pack_lookup', ...(2) }

× detectHarnessTaskIntent > detects generated vanilla asset requests as resource-pack lookups
  → expected { id: 'datapack_lookup', ...(2) } to deeply equal { id: 'resource_pack_lookup', ...(2) }

× buildHarnessTaskRoute > routes vanilla asset lookups as resource-pack lookups using shared resource files evidence
  → expected intent.id 'resource_pack_lookup' but received 'datapack_lookup'
```

This proved `assets/**` and generated vanilla assets were still using datapack
semantics.

## Green
Focused green:

```bash
pnpm exec vitest run packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts
```

Result:

```text
✓ packages/agent-harness/src/intent.test.ts (8 tests) 3ms
✓ packages/agent-harness/src/task-route.test.ts (11 tests) 3ms

Test Files  2 passed (2)
Tests  19 passed (19)
```

MCP request/evidence focused check:

```bash
pnpm exec vitest run apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts
```

Result:

```text
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/evidence-plan.test.ts (8 tests) 18ms
✓ apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts (2 tests) 20ms
✓ apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts (2 tests) 31ms

Test Files  4 passed (4)
Tests  14 passed (14)
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
Tests  424 passed (424)
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
// creates a temporary Java/Gradle workspace, builds an MCP request plan for:
// Read the vanilla official asset assets/minecraft/models/item/stone.json
// then prints task intent, route steps, preferred tools, and evidence candidates
TS
```

Returned value:

```json
{
  "taskIntent": {
    "id": "resource_pack_lookup",
    "confidence": "high",
    "reasons": [
      "request text mentions vanilla resource-pack asset evidence",
      "vanilla assets content can be resolved from generated official packages"
    ]
  },
  "routeSteps": ["datapack_files", "docs_lookup"],
  "preferredTools": [
    "source.bundle",
    "context.query",
    "workspace.analyze"
  ],
  "candidates": [
    {
      "id": "candidate-1-datapack_files",
      "routeStep": "datapack_files",
      "provenance": "datapack_files",
      "preferredTool": "source.bundle",
      "reason": "Request targets generated vanilla assets evidence for Minecraft 1.20.1 before docs.",
      "pathHints": [
        "vanilla-assets-package:minecraft:1.20.1:official"
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
265 packages/shared-types/src/runtime.ts
261 packages/agent-harness/src/intent.ts
229 packages/agent-harness/src/intent.test.ts
207 packages/agent-harness/src/task-route.ts
377 packages/agent-harness/src/task-route.test.ts
421 apps/mcp-server/src/evidence-plan.test.ts
```

## Notes
- This is an internal harness semantics split, not a new executor.
- `datapack_files` remains the concrete route step until a separate design
  proves that a new executor/tool is needed.
- Generated vanilla datapack requests still resolve as `datapack_lookup`; only
  `assets/**` and resource-pack asset wording move to `resource_pack_lookup`.
