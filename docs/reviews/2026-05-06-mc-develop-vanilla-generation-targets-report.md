# mc_develop Vanilla Generation Targets Report

Date: 2026-05-06

## Scope

This slice wires the `minecraft-release-catalog` planner into the public `mc_develop` path.

The MCP still exposes only the progressive `mc_develop` tool. The new path does not download Mojang artifacts, does not install source packages, and does not distribute Minecraft source/data/assets. It returns consent-gated local generation targets from the cached public release catalog.

## Implemented

- Added an MDM release catalog loader for the cached `minecraft-release-catalog` artifact.
- Added `vanilla_generation_targets` source-bundle evidence.
- Added harness routing for explicit vanilla local-generation target requests.
- Threaded the ready MDM release catalog into `source.bundle` from `mc_develop`.
- Added a public tool contract test proving no new tool surface and no remote fetch.

## Concrete Public Tool Output

Request:

```text
List official vanilla local-generation targets for Minecraft 26.1.2. Do not download.
```

Selected evidence:

```text
source: vanilla_generation_targets
status: ready
minecraftVersion: 26.1.2
```

Returned target package IDs:

```text
minecraft-26.1.2-source-pack-named
minecraft-26.1.2-vanilla-datapack-official
minecraft-26.1.2-vanilla-resource-pack-official
minecraft-26.1.2-vanilla-assets-official
```

Each target includes:

```text
requiresUserConsent: true
distributionPolicy: local-generation-only
```

## Verified Commands

Command:

```sh
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-vanilla-generation-targets.test.ts
```

Result:

```text
Test Files  85 passed (85)
Tests       268 passed (268)
```

Note: the MCP server package test script runs the full `apps/mcp-server/src` suite even when an extra path argument is supplied.

Command:

```sh
pnpm --filter @mcpskill/source-package-manager test
```

Result:

```text
Test Files  13 passed (13)
Tests       56 passed (56)
```

Command:

```sh
pnpm --filter @mcpskill/agent-harness test
```

Result:

```text
Test Files  11 passed (11)
Tests       62 passed (62)
```

Command:

```sh
pnpm test
```

Result:

```text
Test Files  184 passed (184)
Tests       654 passed (654)
```

## File Size Check

```text
402 packages/agent-harness/src/intent.ts
365 apps/mcp-server/src/core/tools/mcp-tools.ts
371 apps/mcp-server/src/source-bundle/core/source-bundle-executor.ts
163 apps/mcp-server/src/source-bundle/vanilla/source-bundle-vanilla-generation-targets.ts
73  apps/mcp-server/src/docs/mdm-resource/vanilla-release-catalog.ts
221 apps/mcp-server/src/core/tools/mcp-tools-vanilla-generation-targets.test.ts
```

## Remaining Work

- Add a follow-up route that can suggest installing/caching `minecraft-release-catalog` when the request asks for generation targets but the catalog is missing.
- Add an explicit source-pack acquisition path for Mojang source generation once the decompile/remap backend is ready.
- Keep datapack/resourcepack reads separate from target planning so normal vanilla asset/datapack lookups do not get hijacked by generation planning.
