# Evidence Plan Resource-Pack Test Split Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice only splits resource-pack evidence-plan coverage out of
`apps/mcp-server/src/evidence-plan.test.ts` into
`apps/mcp-server/src/evidence-plan-resource-pack.test.ts`.

No runtime behavior or public MCP tool surface changed.

## Actual Returned Values Preserved

Vanilla official asset requests still produce generated vanilla asset evidence:

```json
{
  "candidates": [
    {
      "id": "candidate-1-datapack_files",
      "routeStep": "datapack_files",
      "provenance": "resource_pack_files",
      "preferredTool": "source.bundle",
      "reason": "Request targets generated vanilla assets evidence for Minecraft 1.20.1 before docs.",
      "pathHints": ["vanilla-assets-package:minecraft:1.20.1:official"]
    },
    {
      "id": "candidate-2-docs_lookup",
      "provenance": "docs"
    }
  ]
}
```

Local `assets/**` requests still use resource-pack intent and resource-pack
file provenance while retaining the current `datapack_files` route step:

```json
{
  "requestPlan": {
    "trace": {
      "taskIntent": {
        "id": "resource_pack_lookup"
      }
    }
  },
  "candidates": [
    {
      "id": "candidate-1-datapack_files",
      "routeStep": "datapack_files",
      "provenance": "resource_pack_files",
      "preferredTool": "source.bundle",
      "reason": "Inspect resource-pack assets before secondary docs.",
      "pathHints": ["<resource-pack-workspace-root>"]
    },
    {
      "id": "candidate-2-docs_lookup",
      "provenance": "docs"
    }
  ]
}
```

## Verification

Pre-split characterization:

```text
$ pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts

Test Files  1 passed (1)
Tests       9 passed (9)
```

Post-split focused verification:

```text
$ pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/evidence-plan-resource-pack.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/mcp-server/src/evidence-plan-resource-pack.test.ts (2 tests) 5ms
✓ apps/mcp-server/src/evidence-plan.test.ts (7 tests) 12ms

Test Files  2 passed (2)
Tests       9 passed (9)
Duration    304ms
```

Line-count guard for the split files:

```text
$ wc -l apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/evidence-plan-resource-pack.test.ts

387 apps/mcp-server/src/evidence-plan.test.ts
112 apps/mcp-server/src/evidence-plan-resource-pack.test.ts
499 total
```

Full workspace verification:

```text
$ pnpm test

Test Files  133 passed (133)
Tests       425 passed (425)
Duration    3.72s
```

Whitespace guard:

```text
$ git diff --check

# no output
```

TypeScript source/test line-count guard:

```text
$ find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'

# no output
```

Go cleanup guard:

```text
$ find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print

# no output
```
