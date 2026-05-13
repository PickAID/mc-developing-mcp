---
name: mc-develop-first
description: Use when working on Minecraft Java mods, NeoForge, Forge, Fabric, KubeJS, ProbeJS, datapacks, resource packs, Minecraft shaders/client visuals, modpack crashes, Gradle mod workspaces, local mod jars, Modrinth/CurseForge metadata, mappings, Minecraft docs, or version migration.
license: PolyForm-Noncommercial-1.0.0
---

# mc_develop First

`mc_develop` is the evidence and capability gateway for Minecraft work. A new agent should not treat it as a keyword search box. Use its structured fields to ask for the exact capability you need, then use normal tools only for file reads, edits, builds, tests, diffs, and commits after MCP evidence points there.

## Operating Rule

For Minecraft tasks:

1. Call `mc_develop` before technical advice, code edits, datapack JSON edits, crash diagnoses, dependency coordinates, or docs claims.
2. If you know the desired capability, use `operations[].kind` plus the matching structured field.
3. Put exact ids, versions, paths, classes, resource locations, symbols, docs topics, and policies into structured fields, not only into `requestText`.
4. Treat `requestText` as human context and fallback only.
5. Read the structured result before acting. If evidence is missing, make the next MCP call more specific instead of guessing.

## First Call Pattern

Use broad auto-detection only when the task is genuinely unclear:

```json
{
  "requestText": "Short exact summary of the Minecraft task.",
  "workspaceRoot": "/absolute/path/to/project-or-modpack"
}
```

When exact intent is known, make the first call structured:

```json
{
  "requestText": "Human context only.",
  "workspaceRoot": "/absolute/path/to/workspace",
  "operations": [
    {
      "kind": "docs_lookup",
      "docsQuery": "NeoForge register event 1.21"
    }
  ]
}
```

Always include the per-instance roots you know:

```json
{
  "workspaceRoot": "/path/to/workspace",
  "runtimeRoot": "/path/to/runtime",
  "mdmSourcesRoot": "/path/to/consumer-mdm-sources",
  "prismRoot": "/path/to/PrismLauncher"
}
```

Reuse `runtimeEnvironment.inputPatch` from MCP results in follow-up calls.

## Capability Map

Use this table before choosing tools or web search.

| Need | MCP operation and structured field |
| --- | --- |
| Java source, Gradle files, local classes | `workspace_source` with `workspaceSource.javaSymbols`, `javaPaths`, or `buildFiles` |
| Java compile/LSP diagnostics | `java_diagnostics` |
| Gradle deps, repositories, source jars, source acquisition plan | `source_acquisition_plan` with `preparationRoutes: ["workspace_gradle"]` and optional `sourceAcquisition` |
| Vanilla source by class/path | `workspace_source` with `vanillaSource` |
| KubeJS symbols, ProbeJS declarations, resources | `probejs_types` with `probeJs.symbol`, `resourceOnly`, `resourceKinds`, `resourceQueries`, `resourceLimitPerKind`, `scope` |
| Crash logs | `log_files` with optional `logFiles.paths` |
| Local mod jars, class owners, mixin targets, entries, inventory | `mod_archive_content` with `modArchive` |
| Broad local jar indexing | `preparationRoutes: ["local_jar"]`, `preparationPolicy.localJarMode: "prewarm_entry_index"` |
| Modrinth, CurseForge, Maven coordinates | `external_mod_resolution` with `externalModRequests` |
| Datapack/resource-pack files and resource locations | `datapack_files` with `datapack.paths`, `resourceLocations`, `mode` |
| Docs, schemas, migrations, loader docs | `docs_lookup` with `docsQuery`, plus `preparationRoutes: ["runtime_cache"]` when resources matter |

Supported `operations[].kind` values:

`source_acquisition_plan`, `workspace_source`, `probejs_types`, `mod_archive_content`, `external_mod_resolution`, `datapack_files`, `docs_lookup`, `log_files`, `java_diagnostics`.

## Structured Field Templates

Docs:

```json
{
  "operations": [
    { "kind": "docs_lookup", "docsQuery": "NeoForge capabilities migration 1.21" }
  ]
}
```

Workspace source:

```json
{
  "operations": [
    {
      "kind": "workspace_source",
      "workspaceSource": {
        "javaSymbols": ["com.example.ExampleMod"],
        "buildFiles": ["build.gradle"]
      }
    }
  ]
}
```

ProbeJS:

```json
{
  "operations": [
    {
      "kind": "probejs_types",
      "probeJs": {
        "symbol": "event.recipes",
        "resourceQueries": ["minecraft:iron_ingot", "#forge:ingots/iron"],
        "scope": "server"
      }
    }
  ],
  "preparationRoutes": ["workspace_probejs"]
}
```

ProbeJS resource inventory:

```json
{
  "operations": [
    {
      "kind": "probejs_types",
      "probeJs": {
        "resourceOnly": true,
        "resourceKinds": ["item"],
        "resourceLimitPerKind": 0
      }
    }
  ],
  "preparationRoutes": ["workspace_probejs"]
}
```

Use `resourceLimitPerKind: 0` for counts-only discovery. Omit it for all matching entries, or set an explicit number when the user wants a bounded export. Use `resourceKinds` and `resourceQueries` for filtering; do not hide those controls in `requestText`.

Local mod jars:

```json
{
  "operations": [
    {
      "kind": "mod_archive_content",
      "modArchive": {
        "classOwners": ["com.example.problem.CrashHandler"],
        "inventory": true
      }
    }
  ],
  "preparationRoutes": ["local_jar"],
  "preparationPolicy": { "localJarMode": "prewarm_entry_index" }
}
```

Datapack/resource-pack:

```json
{
  "operations": [
    {
      "kind": "datapack_files",
      "datapack": {
        "mode": "resource_pack",
        "paths": ["assets/example/models/item/demo.json"],
        "traceReferences": true
      }
    }
  ]
}
```

External mod exact lookup:

```json
{
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "modrinth",
          "projectId": "AANobbMI",
          "slug": "sodium",
          "loader": "neoforge",
          "minecraftVersion": "26.1.2"
        }
      ]
    }
  ],
  "preparationPolicy": { "remoteMetadataPolicy": "enabled" }
}
```

## Unknown External Mods

If slug/project id is unknown, do not pretend `query` is exact. Use discovery first:

```json
{
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "modrinth",
          "query": "Sodium",
          "loader": "neoforge",
          "minecraftVersion": "26.1.2"
        }
      ]
    }
  ],
  "preparationPolicy": { "remoteMetadataPolicy": "enabled" }
}
```

Then:

- If one high-confidence candidate remains, retry with returned `slug` and/or `projectId`.
- If multiple candidates remain, report candidates and ask for confirmation or use local Gradle/jar evidence to disambiguate.
- For CurseForge discovery, credentials are required. If missing, report `CURSEFORGE_API_KEY` instead of falling back to broad guessing.
- Maven has no universal name search. Prefer exact coordinate, workspace Gradle dependencies, local jars, or repository metadata.

Read `references/external-mod-resolution.md` for the full two-phase flow.

## Read The Result

Always inspect these before editing or answering:

- `trace.routeSteps`: confirms the MCP actually ran the intended capability.
- `executions[].queryHint`: should reflect structured fields when exact data was supplied.
- `selectedEvidence`: the citation set for claims or edits.
- `workspacePreparation`: route readiness, missing prerequisites, next call patterns.
- `runtimeEnvironment.inputPatch`: roots to reuse.
- `resourceActions` and `mdmPackageRecommendations`: package proposals, not download consent.
- Domain summaries: `crashSignals`, `javaDiagnostics`, `kubeJsQuality`, `clientVisualVerifier`.

If exact constraints appear only in `requestText` while `queryHint` is broad, the call is not reliable enough. Retry with structured fields.

## Reference Selection

Read only the relevant reference file:

| Task | Reference |
| --- | --- |
| KubeJS/ProbeJS | `references/kubejs-probejs.md` |
| Crashes/logs/local jars | `references/crash-triage.md` |
| Java/Gradle/mappings/source jars | `references/java-gradle-mods.md` |
| Datapacks/resource packs/client visuals | `references/datapack-resourcepack.md` |
| Modrinth/CurseForge/Maven | `references/external-mod-resolution.md` |
| Docs/version/schema/MDM packages | `references/docs-version-resources.md` |
| Runtime roots/environment | `references/runtime-environment.md` |
| Reading MCP output | `references/result-interpretation.md` |

## Normal Tool Boundary

Use normal tools after MCP evidence for:

- Reading exact files named by MCP.
- Editing files.
- Running Gradle, tests, formatters, game/client checks.
- Inspecting diffs, committing, pushing.

Do not use broad `rg`, jar inspection, web search, or guessed docs as a substitute for MCP routes when MCP can provide that evidence.

## Common Failure Modes

- Encoding exact ids or versions only in `requestText`.
- Treating external `query` as final resolution.
- Editing KubeJS before ProbeJS evidence.
- Guessing a crash owner from one exception class.
- Mixing Forge/NeoForge/Fabric docs across versions.
- Editing datapack/resource-pack JSON without schema/version evidence.
- Downloading MDM packages without explicit user consent or prior authorization.
- Persisting environment variables globally when `runtimeEnvironment.inputPatch` is enough.
