# Anonymized Client Rendering Harness Verification

Date: 2026-05-05

## Scope

Added anonymized harness and service-profile guidance for Minecraft client visual, resource, and rendering tasks. The slice covers client UI/screens, block entity renderers, general renderer wiring, connected textures, models, blockstates, asset registration, client initialization, and registry wiring.

The guidance uses generic Minecraft concepts and includes no project-specific
names or copied code.

## Verified Shape

Client visual/resource task routing now returns:

```ts
{
  intent: {
    id: "client_visual_resources",
    confidence: "high"
  },
  steps: [
    "workspace_source",
    "datapack_files",
    "mod_archive_content",
    "docs_lookup"
  ],
  preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
}
```

The task brief evidence policy now appends:

```text
Check assets, models, blockstates, registries, client init, and renderer bindings before docs.
```

The service profile guidance now includes:

```text
For client visual tasks, check assets/models/blockstates plus registry and renderer wiring before docs.
```

Post-review hardening added explicit resource-pack facts to workspace snapshots
and lets KubeJS client visual requests route through the client visual evidence
chain instead of being captured by generic KubeJS authoring. KubeJS visual routes
now include ProbeJS evidence before assets/docs when ProbeJS or KubeJS signals
exist.

## Verification

Targeted tests passed:

```sh
pnpm --filter @mcpskill/agent-harness test
pnpm --filter @mcpskill/service-profile test
pnpm --filter @mcpskill/shared-types build
pnpm --filter @mcpskill/agent-harness build
pnpm --filter @mcpskill/service-profile build
pnpm --filter @mcpskill/workspace-detector test
pnpm typecheck
pnpm test
```

Latest full verification: `pnpm test` passed with 146 test files and 471 tests.
Line guard, Go-file guard, diff whitespace guard, and anonymized-slice leakage
guard passed.

## Risks

The route step `datapack_files` is still the existing shared evidence step for data/assets resources, so the public tool surface remains unchanged. A future split between datapack and resource-pack route steps would allow more precise naming.
