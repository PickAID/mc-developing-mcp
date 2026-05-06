# Source Acquisition Work Item Runner Verification

Date: 2026-05-07
Author: m1hono

## Scope

This slice adds the execution-dispatch contract below the source acquisition planner:

- `planSourceAcquisition` decides candidate routes.
- `buildSourceAcquisitionWorkItems` converts routes into executable work items.
- `runSourceAcquisitionWorkItems` dispatches work items to injected handlers.
- MCP `source_acquisition_plan` evidence now returns compact `workItems` so the agent can see the next executable step.

The runner is intentionally handler-injected. This keeps `@mcpskill/source-package-manager` independent from MCP request state and prevents it from becoming a mixed jar/download/vanilla implementation file.

## Actual MCP Evidence Output

For:

```text
Find source for a NeoForge mod from Modrinth.
```

The relevant payload shape is:

```json
{
  "source": "source_acquisition_plan",
  "requiresWorkspace": false,
  "routes": [
    {
      "origin": "runtime_cache",
      "artifactStrategy": "query_cached_packages_and_indexes",
      "cacheMode": "runtime_source_index_cache",
      "warnings": []
    },
    {
      "origin": "modrinth",
      "artifactStrategy": "resolve_remote_jar_metadata"
    }
  ],
  "workItems": [
    {
      "kind": "remote_metadata",
      "source": "modrinth",
      "cacheScope": "metadata"
    }
  ]
}
```

## Runner Behavior

The runner reports:

- `completed` when every work item handler succeeds.
- `partial` when any item is skipped or failed.
- `empty` when no work items are provided.
- `skipped` with `handler_unavailable` when a handler is not wired yet.
- `failed` with a compact error string when a handler throws, without stopping later work items.

## Verification

Commands:

```bash
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-work-item-runner.test.ts
pnpm --filter @mcpskill/mcp-server test -- core/context-query/context-query-source-acquisition.test.ts
pnpm test
git diff --check
wc -l packages/source-package-manager/src/source-acquisition-work-item-runner.ts packages/source-package-manager/src/source-acquisition-work-item-runner.test.ts apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts apps/mcp-server/src/core/context-query/context-query-source-acquisition.test.ts
```

Results:

```text
source-package-manager targeted: Test Files 16 passed (16), Tests 65 passed (65)
mcp-server targeted: Test Files 89 passed (89), Tests 273 passed (273)
full workspace: Test Files 191 passed (191), Tests 669 passed (669)
```

Line counts:

```text
142 packages/source-package-manager/src/source-acquisition-work-item-runner.ts
126 packages/source-package-manager/src/source-acquisition-work-item-runner.test.ts
 94 apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts
155 apps/mcp-server/src/core/context-query/context-query-source-acquisition.test.ts
```

All checked files stay below the 500-line limit.

## Remaining Link

The next slice should provide concrete MCP-side handlers:

- `jar_index` -> runtime jar/archive index cache.
- `vanilla_generation` -> existing vanilla package generation / confirmation flow.
- `remote_metadata` -> existing Modrinth, CurseForge, and GitHub metadata resolution.
