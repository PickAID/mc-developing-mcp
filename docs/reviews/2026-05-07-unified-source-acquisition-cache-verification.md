# Unified Source Acquisition Cache Verification

Date: 2026-05-07

## Scope

This verifies the first bottom-layer slice for a unified source acquisition planner. The goal is to make source acquisition possible from runtime cache, user/local jars, official vanilla generation, Modrinth, CurseForge, GitHub, Gradle, and ProbeJS without requiring a workspace.

## Implemented

- Added `planSourceAcquisition` to `@mcpskill/source-package-manager`.
- Added route types for workspace Gradle, workspace ProbeJS, runtime cache, local jar, user jar, official, Modrinth, CurseForge, and GitHub.
- Added deterministic priority independent of user-provided remote source order.
- Added consent/cache/privacy fields per route.
- Exported the planner from the package public API.

## Targeted Test

```bash
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-plan.test.ts
```

Result:

```text
Test Files  14 passed (14)
Tests       58 passed (58)
```

## Actual Planner Output

No workspace, user jar, official, Modrinth, CurseForge, GitHub:

```json
{
  "requiresWorkspace": false,
  "routes": [
    "runtime_cache",
    "user_jar",
    "official",
    "modrinth",
    "curseforge",
    "github"
  ],
  "warnings": {
    "curseforge": ["curseforge_credentials_required"]
  }
}
```

Workspace with Gradle, ProbeJS, local jar, and Modrinth:

```json
{
  "requiresWorkspace": false,
  "routes": [
    "workspace_gradle",
    "workspace_probejs",
    "runtime_cache",
    "local_jar",
    "modrinth"
  ],
  "warnings": {
    "modrinth": ["remote_download_denied"]
  }
}
```

## Interpretation

The planner treats Gradle and ProbeJS as fast workspace overlay evidence. They do not prevent runtime cache lookup, jar indexing, or remote metadata planning. This keeps the MCP usable outside a workspace while preserving fast workspace-specific evidence when present.

## Remaining Work

- Wire the route plan into MCP evidence as `source_acquisition_plan`.
- Convert routes into executable work items for jar indexing, vanilla generation, and remote metadata resolution.
- Use existing private runtime cache policy for generated source indexes and jar-derived indexes.
