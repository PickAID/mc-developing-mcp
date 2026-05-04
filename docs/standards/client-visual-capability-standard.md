# Client Visual Capability Standard

Date: 2026-05-05

## Purpose

Low-knowledge visual requests must be translated into concrete Minecraft implementation chains. A request like “the model does not show”, “make a rotating machine”, “dynamic material”, or “screen machine block” is not only an asset question. The agent must reason across registry identity, client-only setup, renderer or screen binding, resource-pack assets, state sync, and reload/cache lifecycle.

## Evidence Order

1. Workspace source: registry declarations, client init, renderer bindings, screen/menu bindings, model layer or baked model hooks, resource location references.
2. Resource-pack assets: blockstates, models, textures, atlases, language keys, particles, GUI textures, custom model metadata.
3. Mod archive content: assets, metadata, class ownership, renderer/client package hints.
4. LSP/Gradle diagnostics: compile side, missing imports, wrong loader API, client/server boundary.
5. Versioned docs only after local evidence is insufficient.

## Implementation Chains

Static block model:
`registry id -> blockstate -> model json -> texture/atlas -> optional render layer`

Block entity visual:
`registry id -> block entity type -> client renderer binding -> renderer implementation -> asset references -> server state sync -> client interpolation`

Screen/menu visual:
`block interaction -> menu/container -> screen registration -> screen widgets/textures -> serverbound action packet -> server-authoritative state update`

Dynamic texture or preview:
`client manager -> texture/render target allocation -> upload/update cadence -> resource reload cleanup -> bounded cache -> renderer/screen consumer`

Mechanical or animated visual:
`static shell asset -> moving part renderer/visual -> previous/current animation state -> partial-tick interpolation -> sync boundary -> performance budget`

## Hard Rules

- Do not treat blockstate variants as a substitute for runtime animation when the visual state is continuous or high-cardinality.
- Do not create textures, buffers, models, or parse JSON in every render frame.
- Do not let screen or renderer code mutate server-authoritative state directly.
- Do not put client-only classes on dedicated-server load paths.
- Do not invent renderer code without checking registry id, client binding, asset path, and sync evidence.
- Do not mix loader APIs. Renderer registration, screen binding, model-layer registration, dynamic texture APIs, and resource reload hooks must be proven for the detected loader/version.
- For KubeJS, do not treat scripts as generic JavaScript. `client_scripts` is the client surface; `startup_scripts` and `server_scripts` have different lifecycle roles.

## Loader And Version API Standard

Before naming a renderer, screen, model-layer, dynamic texture, or reload API, the agent must identify the detected loader and Minecraft version from workspace evidence. API names must come from workspace source, Gradle/source archives, local jars, LSP/source-index evidence, ProbeJS declarations, or versioned docs. If the loader/version proof is missing, the agent should report missing API proof rather than mixing Forge, NeoForge, Fabric, or KubeJS patterns.

`clientVisualEvidence.apiProof` is required structured evidence when local client visual source evidence is available. It is not only prompt guidance. The agent must inspect this proof before emitting loader-specific method names, event names, or imports. If `apiProof` reports missing loader, missing Minecraft version, or a mismatch risk, the implementation plan must downgrade to a verification/fix plan for that API surface.

Minimum API evidence fields should distinguish:

- Loader family and Minecraft version.
- API surface: renderer binding, screen binding, model layer, reload listener, dynamic texture, packet/sync.
- Source proof: file/line, type declaration, dependency source, or versioned docs.
- Mismatch risk: a pattern that appears to belong to another loader or version.

Common symbols are not enough to prove a loader family by themselves. Shared or near-shared client APIs must be paired with Gradle/runtime evidence, imports, local source archives, LSP/source-index evidence, or versioned documentation. KubeJS client hooks prove a KubeJS client surface only; they do not replace Java loader API proof.

## Dynamic Texture Lifecycle Checklist

Dynamic texture or preview systems must name:

- Allocation owner.
- Upload/update cadence.
- Reload invalidation or cleanup path.
- Close/dispose path.
- Bounded cache key.
- Renderer or screen consumer.
- Confirmation that texture allocation, file IO, JSON parsing, and network sends are not performed per render frame.

## Required Output Behavior

When evidence is present, the MCP should return bounded structured evidence with file, line, kind, and compact snippets or symbols. When evidence is missing, the agent should say which link is missing: registry, client init, renderer binding, screen/menu binding, asset reference, sync path, reload/cache lifecycle, or version-specific API proof.

The agent should prefer a concrete implementation plan over broad advice:

- What registry id is being connected.
- Which assets should exist and be read next.
- Which client-only binding should exist.
- Which renderer/screen/model path should own dynamic behavior.
- Which state must be synced or interpolated.
- Which performance and lifecycle traps must be avoided.
