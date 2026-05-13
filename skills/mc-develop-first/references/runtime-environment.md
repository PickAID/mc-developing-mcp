# Runtime Environment Playbook

Use when roots, runtime cache, Prism roots, MDM source checkouts, package installs, or per-instance sharing matter.

## Root Priority

`mc_develop` resolves paths in this order:

1. Explicit input fields in the current tool call.
2. MCP instance environment.
3. Inherited process environment.
4. Built-in defaults.

Prefer explicit input fields for task-specific context. Do not globally persist variables for one workspace if a per-call input patch is enough.

## Common Inputs

```json
{
  "workspaceRoot": "/path/to/project-or-modpack",
  "runtimeRoot": "/path/to/runtime-cache",
  "mdmSourcesRoot": "/path/to/consumer-mdm-sources",
  "prismRoot": "/path/to/PrismLauncher"
}
```

## Defaults To Know

- `runtimeRoot` defaults to `~/.cache/mc-developing-mcp/runtime`.
- `mdmSourcesRoot` should point to a consumer checkout, not the MCP source repository.
- `workspaceRoot` should be the mod project, modpack instance, datapack/resource-pack root, or Prism instance `minecraft` directory.
- `prismRoot` is optional and should be provided only when Prism metadata matters.

## Reusing MCP Patches

When the MCP returns:

- `runtimeEnvironment.inputPatch`: copy these fields into the next `mc_develop` call.
- `runtimeEnvironment.envPatch`: use this for client/server environment configuration only when per-call inputs are impractical.

If the user asks whether environment changes survive restart, distinguish:

- Per-call inputs: not persistent, intentionally instance-scoped.
- MCP instance environment: persistent only if configured in the MCP client/server config.
- Shell profile variables: persistent for shells, but not necessarily for GUI-launched clients.

## MDM Sources Root

`MDM_SOURCES_ROOT` is for resource development/consumer source packages. It should not point at the MCP code maintenance checkout unless the user is explicitly developing that checkout.

When uncertain, call:

```json
{
  "requestText": "Report runtime environment patches and source root expectations for this task.",
  "workspaceRoot": "/path/to/workspace"
}
```

Then follow `runtimeEnvironment.inputPatch` rather than guessing.
