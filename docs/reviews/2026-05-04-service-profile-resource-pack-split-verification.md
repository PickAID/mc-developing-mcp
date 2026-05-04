# Service Profile Resource-Pack Split Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice prevents the internal service profile from treating `assets/**`
resource-pack evidence as datapack evidence.

The MCP public surface is unchanged. The change is limited to internal
capability summary, prompt guidance, and service-profile tests.

## Red
Focused red command:

```bash
pnpm exec vitest run packages/service-profile/src/profile.test.ts
```

Observed failures before implementation:

```text
× buildMinecraftServiceProfile > aggregates Gradle, JDTLS, ProbeJS, datapack, package-manager, and source-index capabilities
  → expected undefined to match object { status: 'ready', rootCount: 1, ...(3) }

× buildMinecraftServiceProfile > keeps assets-only resource packs separate from datapack capability
  → expected { status: 'ready', rootCount: 1, ...(4) } to match object { status: 'not_found', ...(3) }
```

The first failure proved `resourcePack` capability did not exist. The second
failure proved an assets-only workspace still made `datapack` look ready.

## Green
Focused green:

```bash
pnpm exec vitest run packages/service-profile/src/profile.test.ts
```

Result:

```text
✓ packages/service-profile/src/profile.test.ts (2 tests) 16ms

Test Files  1 passed (1)
Tests  2 passed (2)
```

Focused integration check:

```bash
pnpm exec vitest run apps/mcp-server/src/service-profile-context.test.ts apps/mcp-server/src/request-context.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-route-crash.test.ts
```

Result:

```text
✓ packages/agent-harness/src/task-route-crash.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (11 tests) 4ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/service-profile-context.test.ts (1 test) 6ms

Test Files  4 passed (4)
Tests  16 passed (16)
```

Typecheck:

```bash
pnpm typecheck
```

Result:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  132 passed (132)
Tests  423 passed (423)
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
// assets/demo/models/item/gear.json, then builds the service profile
TS
```

Returned value:

```json
{
  "workspaceKind": "unknown",
  "datapack": {
    "status": "not_found",
    "rootCount": 0,
    "fileCount": 0,
    "namespaces": [],
    "dataKinds": [],
    "assetKinds": ["models"]
  },
  "resourcePack": {
    "status": "ready",
    "rootCount": 1,
    "fileCount": 1,
    "namespaces": ["demo"],
    "assetKinds": ["models"]
  },
  "guidance": [
    "Use resource-pack assets, model references, and pack metadata before docs fallback."
  ],
  "prompt": "Workspace kind: unknown\nRuntime: unknown / unknown\nGradle: not_found, source archives=0\nJava LSP: not_java_workspace, implemented=definition,references,hover,workspaceSymbol,diagnostics\nProbeJS types: not_found, files=0\nDatapack: not_found, data=0, namespaces=none\nResource pack: ready, assets=1, kinds=models\nMod archives: not_found, archives=0\nSource indexes: not_found, databases=0\nGuidance: Use resource-pack assets, model references, and pack metadata before docs fallback."
}
```

## Line Counts
Current relevant line counts:

```text
93 packages/service-profile/src/types.ts
154 packages/service-profile/src/profile.ts
85 packages/service-profile/src/guidance.ts
219 packages/service-profile/src/profile.test.ts
```

## Notes
- This intentionally does not add a new MCP tool.
- `DatapackServiceCapability.assetKinds` remains for compatibility, but
  `formatServiceProfilePrompt` now gives resource-pack/assets an explicit line.
- Assets-only roots now inject resource-pack evidence guidance without
  pretending datapack data evidence is ready.
