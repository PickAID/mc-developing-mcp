---
name: mc-develop-first
description: Use when working on Minecraft Java mods, NeoForge, Forge, Fabric, KubeJS, ProbeJS, datapacks, resource packs, shaders in Minecraft clients, modpack crashes, Gradle mod workspaces, local mod jars, mappings, Minecraft docs, or version migration.
license: PolyForm-Noncommercial-1.0.0
---

# mc_develop First

Use `mc_develop` as the evidence gate for Minecraft work. Minecraft facts depend on Gradle files, loader versions, generated ProbeJS declarations, local jars, crash logs, mappings, datapack/resource-pack formats, generated vanilla data, and MDM docs. Normal tools are still useful for editing and tests, but they should not replace MCP evidence lookup.

## Non-Negotiable Flow

For every Minecraft task:

1. Call `mc_develop` before giving technical advice, writing code, editing JSON, diagnosing a crash, or searching the web.
2. Read the returned evidence and recommended next call patterns.
3. If evidence is missing but the MCP suggests a route, call `mc_develop` again with that route before guessing.
4. Only then use file tools to read named evidence, edit files, run tests/builds, or inspect diffs.

Do not answer from memory for version-specific APIs, event names, registry names, pack formats, loader behavior, vanilla schemas, mappings, mod ownership, or crash causes when `mc_develop` is available.

## First Call

Pass the user's exact goal in `requestText`. Include `workspaceRoot` when there is a project, modpack, Prism instance, datapack, resource pack, or local jar workspace.

```json
{
  "requestText": "Summarize the exact Minecraft task or bug here.",
  "workspaceRoot": "/absolute/path/to/project-or-modpack"
}
```

If prior MCP output or the user provides per-instance roots, reuse them explicitly:

```json
{
  "requestText": "Continue the Minecraft task with the known runtime context.",
  "workspaceRoot": "/path/to/workspace",
  "runtimeRoot": "/path/to/runtime",
  "mdmSourcesRoot": "/path/to/mdm-sources",
  "prismRoot": "/path/to/PrismLauncher"
}
```

The MCP resolves roots in this order: per-call input, MCP instance environment, inherited process environment, built-in defaults. Reuse `runtimeEnvironment.inputPatch` and `runtimeEnvironment.envPatch` instead of inventing persistent environment variables.

## Choose A Playbook

Read only the reference file matching the task:

| Task | Reference |
| --- | --- |
| KubeJS, ProbeJS, recipes, tags, startup/server/client scripts | `references/kubejs-probejs.md` |
| Crash logs, modpack startup failures, missing classes, mixin errors | `references/crash-triage.md` |
| Java mods, NeoForge/Forge/Fabric Gradle projects, mappings, source jars | `references/java-gradle-mods.md` |
| Datapacks, resource packs, assets, models, tags, loot, recipes, vanilla schemas | `references/datapack-resourcepack.md` |
| Modrinth, CurseForge, CurseMaven, Modrinth Maven, external dependency coordinates | `references/external-mod-resolution.md` |
| Minecraft docs, NeoForge/Forge docs, version changes, MDM packages | `references/docs-version-resources.md` |
| Environment roots, runtime cache, MDM source checkout, per-instance sharing | `references/runtime-environment.md` |
| How to read `mc_develop` structured output and decide next action | `references/result-interpretation.md` |
| Checking whether this Skill changes agent behavior | `references/pressure-tests.md` |

If more than one task applies, read the most specific task reference first, then `references/result-interpretation.md`.

## Route Cheatsheet

Use explicit `operations` when the desired MCP capability is known. Let auto-detection handle only broad first-pass triage or unclear requests.

| Need | Hint |
| --- | --- |
| Gradle dependencies, repositories, source jars | `preparationRoutes: ["workspace_gradle"]` |
| KubeJS/ProbeJS symbols, recipes, tags, registries | `preparationRoutes: ["workspace_probejs"]` |
| Offline MDM docs or source indexes | `preparationRoutes: ["runtime_cache"]` |
| Local mod jars, assets, data, class owners | `preparationRoutes: ["local_jar"]` |
| User-supplied jar paths | `preparationRoutes: ["user_jar"]` |
| Broad crash triage across many jars | `preparationPolicy.localJarMode: "prewarm_entry_index"` |
| Remote Modrinth/GitHub metadata after local evidence is insufficient | `preparationPolicy.remoteMetadataPolicy: "enabled"` |

## Explicit Operations

Prefer `operations` over hiding control instructions in `requestText`. If you know an exact id, path, class, resource location, symbol, docs topic, or MCP capability, put it in a structured operation field.

```json
{
  "requestText": "Short human context for the task.",
  "workspaceRoot": "/absolute/path/to/workspace",
  "operations": [
    { "kind": "source_acquisition_plan" },
    { "kind": "external_mod_resolution" },
    { "kind": "docs_lookup" }
  ]
}
```

Supported `kind` values:

`source_acquisition_plan`, `workspace_source`, `probejs_types`, `mod_archive_content`, `external_mod_resolution`, `datapack_files`, `docs_lookup`, `log_files`, `java_diagnostics`.

Structured operation fields:

- `docsQuery`: exact docs search query for `docs_lookup`.
- `workspaceSource`: `javaSymbols`, `javaPaths`, `buildFiles`, and optional `line` for `workspace_source`.
- `probeJs`: `symbol`, `resourceQueries`, `resourceOnly`, `scope`, and `includeLifecycle` for `probejs_types`.
- `modArchive`: `queries`, `entryPaths`, `nestedEntryPaths`, `classOwners`, `mixinTargets`, `decompileClasses`, `listDomains`, `inventory`, `refreshInventory`, `preDecompileAnalysis`, and `hotaiPatchProof` for `mod_archive_content`.
- `datapack`: `resourceLocations`, `paths`, `traceReferences`, `migration`, and `mode` for `datapack_files`.
- `logFiles`: exact log/crash-report paths for `log_files`.
- `vanillaSource`: `symbol`, `packageHint`, `relativePath`, or `maxFiles` for version-bound vanilla source through `workspace_source`.
- `sourceAcquisition`: `sourceIndexQuery`, `minecraftVersion`, and `mapping` for `source_acquisition_plan`.
- `externalModRequests`: Modrinth, CurseForge, or Maven constraints for `external_mod_resolution`.

For exact Modrinth/CurseForge/Maven work, use `externalModRequests`; do not ask the MCP to parse project ids, slugs, loaders, or versions from prose.

If Gradle dependencies are known but source jars are missing, call again with:

```json
{
  "gradleSourceDiscovery": {
    "includeDefaultGradleUserHome": true
  }
}
```

## Read The Result Before Acting

Always inspect:

- `workspacePreparation`: detected workspace shape, route readiness, missing prerequisites, next call patterns.
- `runtimeEnvironment`: input/env patches to keep per-instance roots consistent.
- `resourceActions`: recommended MDM package installs and input patches.
- `mdmPackageRecommendations`: docs, schema, source, mapping, loader, shader, or version-change packages that can improve evidence.
- `selectedEvidence`: concrete files, docs, jars, symbols, schema records, or source references selected by the MCP.
- `crashSignals`: exceptions, missing classes, mixin targets, resource paths, metadata hints.
- `javaDiagnostics`: Java/LSP diagnostics for mod source work.
- `kubeJsQuality`: KubeJS/ProbeJS findings and authoring warnings.
- `clientVisualVerifier`: asset, model, rendering, UI, and shader proof-chain status.

If `workspacePreparation.workflow.nextCallPatterns` exists, prefer those shapes. If `resourceActions.actions` proposes a package, do not download immediately; follow `references/docs-version-resources.md`.

## What Counts As Success

Your final answer or code change should be traceable to one of:

- Local workspace evidence selected by `mc_develop`.
- MDM docs/schema/source/mapping evidence selected by `mc_develop`.
- A follow-up route recommended by the MCP.
- A normal test/build result after evidence-based edits.

When you use non-MCP tools, state why they are the right next step: editing, reading exact files named by MCP, running tests, or checking diffs.

## Escalation Rules

- Use web search only after local/MCP evidence is insufficient or the user explicitly asks for current external confirmation.
- Use remote metadata only when local jars/Gradle/MDM docs cannot answer the question.
- Ask before generated vanilla source or MDM release downloads unless the user already authorized acquisition.
- Never persist environment variables just to make one task work when a per-call input patch can carry the value.

## Common Mistakes

- Editing KubeJS without ProbeJS evidence.
- Diagnosing a crash from the exception class only.
- Treating datapack/resource-pack JSON as version-stable.
- Looking up NeoForge/Forge docs directly before asking MDM/docs routes.
- Using `rg` over jars and logs instead of the MCP jar/crash routes.
- Ignoring `runtimeEnvironment.inputPatch` and losing per-instance roots on the next call.
