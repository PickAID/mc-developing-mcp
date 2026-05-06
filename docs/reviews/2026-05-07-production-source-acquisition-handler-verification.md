# Production Source Acquisition Handler Verification

Date: 2026-05-07
Author: m1hono

## Scope

This slice wires source acquisition work item handlers into the production `mc_develop` tool path with conservative defaults.

## Policy

Production `mc_develop` now injects source acquisition handlers with:

```json
{
  "runtimeRoot": "<resolved runtime root>",
  "remoteMetadataPolicy": "disabled"
}
```

This means:

- `jar_index` can use runtime-private jar/archive SQLite cache.
- `vanilla_generation` can return confirmation evidence and use runtime package state.
- `remote_metadata` is not executed by default, so Modrinth and CurseForge are not contacted from source-acquisition context evidence.
- The existing `external_mod_resolution` route remains responsible for selected remote resolution when that route is selected.

## Real High-Level Tool Output

For:

```text
Find source for a NeoForge mod from Modrinth without a workspace.
```

The high-level tool now returns `source_acquisition_plan` as context evidence with conservative execution evidence:

```json
{
  "routeStep": "source_acquisition_plan",
  "status": "context",
  "payload": {
    "source": "source_acquisition_plan",
    "workItemExecutionStatus": "partial",
    "workItemExecutions": [
      {
        "kind": "remote_metadata",
        "status": "skipped",
        "reason": "handler_unavailable"
      }
    ]
  }
}
```

The selected evidence remains `external_mod_resolution`, preserving the existing route behavior.

## Verification

Commands:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools.test.ts source-acquisition/source-acquisition-work-item-handlers.test.ts
pnpm test
git diff --check
wc -l apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts apps/mcp-server/src/core/tools/mcp-tools.ts apps/mcp-server/src/core/tools/mcp-tools.test.ts
```

Results:

```text
mcp-server targeted: Test Files 90 passed (90), Tests 281 passed (281)
full workspace: Test Files 192 passed (192), Tests 677 passed (677)
```

Line counts:

```text
290 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts
372 apps/mcp-server/src/core/tools/mcp-tools.ts
457 apps/mcp-server/src/core/tools/mcp-tools.test.ts
```

All checked files remain below the 500-line limit.

## Remaining Work

The remaining production polish should focus on:

- a separate explicit policy for enabling remote source acquisition handlers;
- a better public hint that CurseForge requires `CURSEFORGE_API_KEY`;
- more real-workspace acceptance cases for user jar paths and confirmed vanilla generation.
