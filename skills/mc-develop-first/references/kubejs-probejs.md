# KubeJS And ProbeJS Playbook

Use for KubeJS scripts, recipes, item/fluid/tag lookups, startup/server/client scripts, ProbeJS declarations, and modpack scripting.

## Structured First Call

```json
{
  "requestText": "Context only: inspect KubeJS/ProbeJS before editing.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    {
      "kind": "probejs_types",
      "probeJs": {
        "symbol": "event.recipes",
        "resourceQueries": ["minecraft:iron_ingot"],
        "scope": "server"
      }
    }
  ],
  "preparationRoutes": ["workspace_probejs"]
}
```

If the workspace is a Prism instance and the user gives the Prism root:

```json
{
  "requestText": "Context only: use Prism and ProbeJS context.",
  "workspaceRoot": "/path/to/PrismLauncher/instances/Name/minecraft",
  "prismRoot": "/path/to/PrismLauncher",
  "operations": [
    {
      "kind": "probejs_types",
      "probeJs": {
        "resourceOnly": true,
        "resourceQueries": ["minecraft:iron_ingot"]
      }
    }
  ],
  "preparationRoutes": ["workspace_probejs"]
}
```

## What To Inspect

Read these result fields:

- `workspacePreparation`: confirms KubeJS folder shape and ProbeJS readiness.
- `kubeJsQuality`: script warnings, invalid locations, missing ProbeJS hints.
- `selectedEvidence`: relevant `.d.ts`, snippets, scripts, registry and resource evidence.
- `selectedEvidence.payload.probeResources.summary.totalCounts`: total matching ProbeJS resources by kind.
- `selectedEvidence.payload.probeResources.entries`: returned entries. If the caller set `resourceLimitPerKind`, this is intentionally bounded.
- `resourceActions` and `mdmPackageRecommendations`: docs/package suggestions.

ProbeJS is not a traditional docs reference. It is generated evidence from the current modpack instance: declarations, snippets, items, recipes, tags, fluids, registries, classes, and language keys. Use it to validate what exists in this instance before editing scripts.

## Follow-Up Calls

If ProbeJS resources are missing but the workspace contains KubeJS, ask the user to generate ProbeJS data if needed. Do not invent event names.

If the task needs item, fluid, recipe, or tag evidence, continue with structured `probeJs.resourceQueries`:

```json
{
  "requestText": "Context only: find ProbeJS resource evidence.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    {
      "kind": "probejs_types",
      "probeJs": {
        "resourceOnly": true,
        "resourceQueries": ["#forge:ingots/iron", "minecraft:iron_ingot"]
      }
    }
  ],
  "preparationRoutes": ["workspace_probejs"]
}
```

If the user asks for "all items" or another full registry-like list, do not guess or return a hidden preview. First ask MCP for counts only:

```json
{
  "requestText": "Context only: count ProbeJS item resources.",
  "workspaceRoot": "/path/to/modpack-or-instance",
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

Then choose the next call from the user's goal:

- Full export: omit `resourceLimitPerKind`.
- Bounded export: set `resourceLimitPerKind` to the requested number.
- Filtered export: set `resourceKinds` and `resourceQueries`, for example `["item"]` plus `["ingot", "create:"]`.
- Counts-only: keep `resourceLimitPerKind: 0`.

Do not call a bounded result "all items". Compare `summary.counts` with `summary.totalCounts`; if they differ or `summary.truncated` is true, say the output was intentionally limited and offer the exact follow-up shape.

If the script references a mod API or class outside ProbeJS evidence, combine routes:

```json
{
  "requestText": "Resolve this KubeJS script issue and identify any owning mod jar evidence for referenced ids/classes.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    {
      "kind": "probejs_types",
      "probeJs": {
        "symbol": "event.recipes",
        "scope": "server"
      }
    },
    {
      "kind": "mod_archive_content",
      "modArchive": {
        "queries": ["example:resource_id"]
      }
    }
  ],
  "preparationRoutes": ["workspace_probejs", "local_jar"]
}
```

## Editing Rules

- Edit only the correct script phase: `startup_scripts`, `server_scripts`, or `client_scripts`.
- Match the event names and signatures found in ProbeJS or selected docs.
- Do not convert KubeJS scripts into generic JavaScript style if KubeJS APIs require different patterns.
- Keep IDs namespaced and verify resource locations when the MCP provides registry/tag evidence.

## Verification

Prefer the project's existing modpack check command if present. If not, at least run syntax/static checks available in the workspace and report if runtime verification requires launching Minecraft.
