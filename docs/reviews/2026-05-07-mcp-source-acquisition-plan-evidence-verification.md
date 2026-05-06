# MCP Source Acquisition Plan Evidence Verification

Date: 2026-05-07
Author: m1hono

## Scope

This slice wires the unified source acquisition planner into MCP evidence execution without expanding the public tool surface.

It adds a `source_acquisition_plan` evidence route before external mod resolution only when the request asks for source/cache/jar/offline/workspace acquisition. The route is treated as context evidence, so the request executor can still select the concrete evidence provider such as external mod resolution.

## Real Output

Example request:

```text
Find source for a NeoForge mod from Modrinth without a workspace.
```

Context payload:

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
      "artifactStrategy": "resolve_remote_jar_metadata",
      "cacheMode": "runtime_metadata_cache",
      "warnings": []
    }
  ]
}
```

The planner does not require a workspace. Workspace Gradle and ProbeJS remain fast overlays when present, not hard dependencies.

## Verification Commands

```bash
pnpm test
git diff --check
wc -l apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts apps/mcp-server/src/core/context-query/context-query-source-acquisition.test.ts apps/mcp-server/src/request/evidence/evidence-plan-source-acquisition.test.ts apps/mcp-server/src/request/execution/request-executor-source-acquisition.test.ts apps/mcp-server/src/request/evidence/evidence-plan.ts
```

## Verification Result

```text
Test Files  189 passed (189)
Tests       661 passed (661)
```

`git diff --check` completed with exit code 0.

Line counts:

```text
  74 apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts
 148 apps/mcp-server/src/core/context-query/context-query-source-acquisition.test.ts
 120 apps/mcp-server/src/request/evidence/evidence-plan-source-acquisition.test.ts
  48 apps/mcp-server/src/request/execution/request-executor-source-acquisition.test.ts
 432 apps/mcp-server/src/request/evidence/evidence-plan.ts
```

All checked source/test files stay below the 500-line limit.

## Notes

The route injection is intentionally conservative. It only triggers when `external_mod_resolution` is already part of the route and the request text mentions source acquisition concepts. This avoids changing normal Maven/Modrinth coordinate resolution flows that do not need a planning prelude.
