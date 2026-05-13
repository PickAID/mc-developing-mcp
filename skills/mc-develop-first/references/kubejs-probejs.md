# KubeJS And ProbeJS Playbook

Use for KubeJS scripts, recipes, item/fluid/tag lookups, startup/server/client scripts, ProbeJS declarations, and modpack scripting.

## First Call

```json
{
  "requestText": "Inspect KubeJS/ProbeJS context for this task, then identify the correct events, registries, items, tags, or script locations before editing.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "preparationRoutes": ["workspace_probejs"]
}
```

If the workspace is a Prism instance and the user gives the Prism root:

```json
{
  "requestText": "Use Prism and ProbeJS context for this KubeJS task.",
  "workspaceRoot": "/path/to/PrismLauncher/instances/Name/minecraft",
  "prismRoot": "/path/to/PrismLauncher",
  "preparationRoutes": ["workspace_probejs"]
}
```

## What To Inspect

Read these result fields:

- `workspacePreparation`: confirms KubeJS folder shape and ProbeJS readiness.
- `kubeJsQuality`: script warnings, invalid locations, missing ProbeJS hints.
- `selectedEvidence`: relevant `.d.ts`, snippets, scripts, registry evidence.
- `resourceActions` and `mdmPackageRecommendations`: docs/package suggestions.

## Follow-Up Calls

If ProbeJS resources are missing but the workspace contains KubeJS, ask the user to generate ProbeJS data if needed. Do not invent event names.

If the task needs item, fluid, recipe, or tag evidence, continue with a requestText that names the exact thing:

```json
{
  "requestText": "Find KubeJS/ProbeJS evidence for item ids, tags, and recipe event signatures needed by <task>.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "preparationRoutes": ["workspace_probejs"]
}
```

If the script references a mod API or class outside ProbeJS evidence, combine routes:

```json
{
  "requestText": "Resolve this KubeJS script issue and identify any owning mod jar evidence for referenced ids/classes.",
  "workspaceRoot": "/path/to/modpack-or-instance",
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
