# Source Acquisition Remote Metadata Handler Verification

Date: 2026-05-07
Author: m1hono

## Scope

This slice adds MCP-side source acquisition work item handlers for remote metadata.

The important boundary is intentional:

- `source_acquisition_plan` still defaults to planning only.
- No network request is made unless a work item handler is explicitly injected.
- Remote metadata uses the existing Modrinth and CurseForge resolver code instead of duplicating API logic.
- CurseForge still requires a user-provided API key; without one, the handler returns setup guidance.

## Implemented Behavior

`remote_metadata` work items now support:

- Modrinth metadata resolution with injected fetch/API base URL.
- CurseForge metadata resolution with injected API key/fetch/API base URL.
- Constraint checks before network access.
- GitHub repository metadata guidance when no repository URL or slug is provided.

When handlers are injected into `buildMcpServerContextQueryExecutor`, source acquisition evidence includes execution evidence:

```json
{
  "source": "source_acquisition_plan",
  "workItemExecutionStatus": "completed",
  "workItemExecutions": [
    {
      "kind": "remote_metadata",
      "status": "completed",
      "payload": {
        "source": "test_remote_metadata",
        "platform": "modrinth"
      }
    }
  ]
}
```

## Real Handler Output

For:

```text
Find source metadata for Sodium fabric 1.20.1 on Modrinth.
```

The handler called:

```text
https://api.test.modrinth.local/v2/project/sodium
https://api.test.modrinth.local/v2/project/sodium/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D
```

The returned payload included:

```json
{
  "source": "source_acquisition_remote_metadata",
  "result": {
    "source": "modrinth",
    "candidates": [
      {
        "slug": "sodium",
        "fileName": "sodium-fabric-0.5.11+mc1.20.1.jar"
      }
    ]
  }
}
```

For CurseForge without a key, the payload includes:

```json
{
  "code": "credentials_required",
  "credentialEnvVar": "CURSEFORGE_API_KEY"
}
```

For missing constraints, no remote fetch is called and the payload includes:

```json
{
  "code": "needs_more_constraints"
}
```

## Verification

Commands:

```bash
pnpm --filter @mcpskill/mcp-server test -- source-acquisition/source-acquisition-work-item-handlers.test.ts
pnpm --filter @mcpskill/mcp-server test -- core/context-query/context-query-source-acquisition.test.ts source-acquisition/source-acquisition-work-item-handlers.test.ts
pnpm test
git diff --check
wc -l apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.test.ts apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts apps/mcp-server/src/core/context-query/context-query-executor.ts apps/mcp-server/src/core/context-query/context-query-source-acquisition.test.ts
```

Results:

```text
mcp-server handler targeted: Test Files 90 passed (90), Tests 276 passed (276)
mcp-server integration targeted: Test Files 90 passed (90), Tests 277 passed (277)
full workspace: Test Files 192 passed (192), Tests 673 passed (673)
```

Line counts:

```text
131 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts
160 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.test.ts
109 apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts
137 apps/mcp-server/src/core/context-query/context-query-executor.ts
189 apps/mcp-server/src/core/context-query/context-query-source-acquisition.test.ts
```

All checked files remain below the 500-line limit.

## Remaining Work

The next handler slices should cover:

- `jar_index` through runtime jar/archive SQLite cache.
- `vanilla_generation` through the existing source package confirmation and vanilla package generation flow.
