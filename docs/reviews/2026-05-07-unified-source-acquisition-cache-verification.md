# Unified Source Acquisition Cache Verification

Date: 2026-05-07

## Scope

This verifies the first bottom-layer slice for a unified source acquisition planner. The goal is to make source acquisition possible from runtime cache, user/local jars, official vanilla generation, Modrinth, CurseForge, GitHub, Gradle, and ProbeJS without requiring a workspace.

## Implemented

- Added `planSourceAcquisition` to `@mcpskill/source-package-manager`.
- Added route types for workspace Gradle, workspace ProbeJS, runtime cache, local jar, user jar, official, Modrinth, CurseForge, and GitHub.
- Added deterministic priority independent of user-provided remote source order.
- Added consent/cache/privacy fields per route.
- Added MCP evidence route `source_acquisition_plan` as context-only planning evidence.
- Added hand-off work items for jar indexing, vanilla generation, and remote metadata lookup.
- Added generated local cache metadata contract for private runtime-only source indexes.
- Exported the planner from the package public API.

## Targeted Test

```bash
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-plan.test.ts
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-hand-off.test.ts
pnpm --filter @mcpskill/resource-registry test -- package-metadata.test.ts
```

Result:

```text
source-package-manager: Test Files 15 passed (15), Tests 62 passed (62)
resource-registry: Test Files 8 passed (8), Tests 31 passed (31)
```

Full workspace verification:

```bash
pnpm test
```

Result:

```text
Test Files  190 passed (190)
Tests       666 passed (666)
```

Line guard:

```text
258 packages/source-package-manager/src/source-acquisition-plan.ts
 82 packages/source-package-manager/src/source-acquisition-plan.test.ts
 89 packages/source-package-manager/src/source-acquisition-hand-off.ts
103 packages/source-package-manager/src/source-acquisition-hand-off.test.ts
 87 packages/resource-registry/src/package-metadata.test.ts
```

## Actual Planner Output

No workspace, user jar, official, Modrinth, CurseForge, GitHub:

```json
{
  "requiresWorkspace": false,
  "routes": [
    {
      "origin": "runtime_cache",
      "artifactStrategy": "query_cached_packages_and_indexes",
      "cacheMode": "runtime_source_index_cache",
      "warnings": []
    },
    {
      "origin": "user_jar",
      "artifactStrategy": "index_binary_jar",
      "cacheMode": "runtime_artifact_cache",
      "warnings": []
    },
    {
      "origin": "official",
      "artifactStrategy": "generate_vanilla_source_or_assets",
      "cacheMode": "runtime_artifact_cache",
      "warnings": []
    },
    {
      "origin": "modrinth",
      "artifactStrategy": "resolve_remote_jar_metadata",
      "cacheMode": "runtime_metadata_cache",
      "warnings": []
    },
    {
      "origin": "curseforge",
      "artifactStrategy": "resolve_remote_jar_metadata",
      "cacheMode": "runtime_metadata_cache",
      "warnings": ["curseforge_credentials_required"]
    },
    {
      "origin": "github",
      "artifactStrategy": "resolve_remote_source_repository",
      "cacheMode": "runtime_metadata_cache",
      "warnings": []
    }
  ]
}
```

Workspace with Gradle, ProbeJS, local jar, and Modrinth:

```json
{
  "requiresWorkspace": false,
  "routes": [
    {
      "origin": "workspace_gradle",
      "artifactStrategy": "read_declared_dependencies",
      "cacheMode": "workspace_overlay",
      "warnings": []
    },
    {
      "origin": "workspace_probejs",
      "artifactStrategy": "read_probejs_types_and_registries",
      "cacheMode": "workspace_overlay",
      "warnings": []
    },
    {
      "origin": "runtime_cache",
      "artifactStrategy": "query_cached_packages_and_indexes",
      "cacheMode": "runtime_source_index_cache",
      "warnings": []
    },
    {
      "origin": "local_jar",
      "artifactStrategy": "index_binary_jar",
      "cacheMode": "runtime_artifact_cache",
      "warnings": []
    },
    {
      "origin": "modrinth",
      "artifactStrategy": "resolve_remote_jar_metadata",
      "cacheMode": "runtime_metadata_cache",
      "warnings": ["remote_download_denied"]
    }
  ]
}
```

## Actual Hand-Off Output

The route-to-work-item bridge returned:

```json
[
  {
    "kind": "jar_index",
    "sourceArchive": "/packs/libs/example.jar",
    "cacheScope": "private_runtime"
  },
  {
    "kind": "vanilla_generation",
    "minecraftVersion": "1.21.1",
    "cacheScope": "private_runtime"
  },
  {
    "kind": "remote_metadata",
    "source": "modrinth",
    "cacheScope": "metadata"
  }
]
```

Generated cache metadata returned:

```json
{
  "storageKind": "generated_local_cache",
  "installTier": "private_local_cache",
  "commitPolicy": "private_generated_cache"
}
```

## Interpretation

The planner treats Gradle and ProbeJS as fast workspace overlay evidence. They do not prevent runtime cache lookup, jar indexing, or remote metadata planning. This keeps the MCP usable outside a workspace while preserving fast workspace-specific evidence when present.

## Remaining Work

- Connect `SourceAcquisitionWorkItem` execution to the existing jar-source-adapter, vanilla generator, and external mod resolver.
- Add broader integration tests that start from one `mc_develop` request and verify the complete planner to executor path.
- Continue keeping generated Minecraft, ProbeJS, and modpack-derived content out of the repository and in private runtime cache.
