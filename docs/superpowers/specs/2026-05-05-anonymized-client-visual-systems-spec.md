<!-- markdownlint-disable MD013 MD022 MD032 -->

# Anonymized Client Visual Systems Spec
Date: 2026-05-05
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`

## Problem Statement
Minecraft client visual work depends on several evidence domains at once: Java or mapped source, registry wiring, resource-pack assets, language entries, network or data sync, and client-only initialization. Agents often answer these tasks from memory, which produces brittle advice for screens, menus, block entity renderers, entity renderers, connected-resource patterns, and multipart model behavior.

The MCP should guide agents to inspect local evidence before giving implementation advice. This spec defines a generic evidence policy for client visual systems. It is documentation only.

## Goals
- Define how the MCP and agent harness should gather evidence for client visual tasks.
- Treat resource-pack assets as first-class evidence for rendering questions.
- Connect registry evidence, asset evidence, and renderer evidence into one route.
- Keep guidance generic, anonymized, and original.
- Define future implementation slices with test expectations.

## Non-Goals
- No implementation-specific project names.
- No copied code examples.
- No user-machine local paths.
- No subjective art-direction curriculum.
- No image generation, image recognition, or binary texture dumping.
- No new public MCP tool unless a future slice proves that a tiny index export is necessary.

## Core Policy
Client visual answers must cite evidence from the project before prescribing code. The route should prefer local source, local generated metadata, local resource assets, and mod archive evidence over generic docs. Documentation fills gaps only after the MCP records what local evidence was found or missing.

The system should return compact summaries by default. It should read full JSON or source snippets only when the request requires them and the token budget allows it.

## UI, Screen, And Menu Evidence Policy
For screen, widget, container, or menu tasks, the harness should inspect these evidence domains in order:

- Menu type registration and server-side menu class.
- Client screen registration and screen constructor signature.
- Network-open path or interaction path that opens the menu.
- Slot layout, data slot usage, property sync, and access checks.
- Language keys for titles, labels, tooltips, and buttons.
- GUI textures, sprites, atlases, fonts, and referenced models.
- Client-only package boundaries and sided event registration.

The MCP should not infer a UI layout from a texture file name alone. It may report candidate GUI assets and language keys, then ask the agent to inspect the screen class or menu class when present.

When a screen depends on synced server state, evidence must include the sync mechanism. Valid evidence includes menu data slots, custom packets, entity data accessors, block entity update tags, block update packets, or explicit client cache invalidation.

## Resource-Pack Asset Evidence Policy
Resource-pack assets are implementation evidence, not decoration. For client visual work, the MCP should index and summarize these paths when available:

- `assets/<namespace>/blockstates/**/*.json`
- `assets/<namespace>/models/**/*.json`
- `assets/<namespace>/textures/**/*.png`
- `assets/<namespace>/atlases/**/*.json`
- `assets/<namespace>/lang/**/*.json`
- `assets/<namespace>/particles/**/*.json`
- `assets/<namespace>/sounds.json`
- `assets/<namespace>/font/**/*.json`
- `assets/<namespace>/shaders/**/*.json` when relevant to the target version and loader
- UI stretch/slicing metadata or naming conventions, GUI sprite atlases, and widget texture regions.

Default output should be counts by namespace and kind, with a small bounded sample only when it helps route the next read. Full JSON reads require an explicit path or a narrow task such as tracing a missing model parent or unresolved texture reference.

Binary assets should stay metadata-only by default. The MCP may record path, size, namespace, kind, and source provenance. It should not dump binary bytes into context.

Stretchable UI assets are implementation rules, not merely images. Evidence should identify the texture path, metadata path when present, fixed regions, stretchable regions, target widget bounds, scaling behavior, and fallback when the current version uses a different GUI drawing abstraction. If formal metadata is absent, the MCP may report naming/path evidence only and require the agent to verify dimensions before giving coordinates.

## Shader And External Visual Reference Policy
Shader work should be grounded in Minecraft resource and renderer evidence first:

- Local shader JSON, post-processing chain, core shader resources, uniforms, samplers, and referenced textures.
- Renderer or screen code that binds the shader, render target, buffer source, render type, or post chain.
- Reload lifecycle and fallback behavior when shaders are disabled, missing, or unsupported by the current loader/version.
- Version-specific proof for the rendering abstraction before naming concrete classes or methods.

External shader-reference services may be used only as optional inspiration or formula lookup when local evidence is insufficient and the task explicitly needs shader design help. They must not become a public-tool explosion. The MCP should expose them through an internal provider behind an existing progressive evidence route, with these constraints:

- Prefer an explicit user-provided API key when the provider is activated.
- Without an API key, either run an injected local browser fallback provider or report `browser_fallback_required` with the env var name, setup URL, and a bounded Chrome DevTools/Playwright extraction plan.
- Cache only compact, non-private derived summaries needed for the current task.
- Convert formulas and techniques into Minecraft evidence terms: uniforms, sampler inputs, time/state source, resolution/source texture, render target ownership, and reload/fallback path.
- Never paste large shader bodies or treat web examples as project code.

## Version-Resilience Policy
Client APIs can be renamed, moved, or structurally replaced across Minecraft and loader versions. The agent must not answer by memorizing one version's class names. It should use this order:

1. Identify the workspace runtime and confidence.
2. Inspect local source, imports, Gradle dependencies, generated source archives, LSP/source index, or docs package evidence.
3. Map the requested task to stable roles: draw context, pose/buffer owner, screen/widget owner, shader/post-chain owner, render target owner, reload owner, state sync owner.
4. Name concrete APIs only after evidence proves the current version surface.
5. If a familiar API is missing, search for role-equivalent replacements instead of failing or hallucinating.

When a major version has rendering or GUI changes, the answer should provide the role formula and the evidence path first, then the version-specific API names if proven.

## Asset Reference Policy
The MCP should trace client asset references as a graph when enough JSON evidence exists:

- Blockstates may reference block models.
- Block models may reference parent models and textures.
- Item models or item definitions may reference models, predicates, conditions, and textures.
- Atlas JSON may define sprite source directories or files.
- Particle JSON may reference textures.
- Font JSON may reference bitmap providers or other provider sources.
- Language files may provide screen, item, block, tooltip, and subtitle text.

Trace output should show `from`, `to`, `kind`, and unresolved references. It should omit long JSON payloads unless the user asks for a specific file.

## Connected-Texture-Like Evidence Policy
Connected-texture-like systems should be treated as a generic resource and renderer pattern. The MCP must not assume any particular library, project, or naming scheme.

Evidence should identify:

- The block or block family whose appearance changes by neighbor, state, biome, or attached data.
- Asset variants that appear to represent edge, corner, overlay, framed, connected, or tiled states.
- Blockstate or model files that select variants by property or multipart condition.
- Renderer, baked-model, model-loader, or client hook classes that compute visual joins at runtime.
- Texture atlas participation for any referenced sprite.
- Data source for visual decisions, such as block state, block entity data, neighbor queries, or model data.

The agent should separate static JSON selection from runtime model selection. A multipart blockstate is evidence for data-driven selection. A custom baked model or renderer is evidence for runtime selection. The final answer should state which one the project uses when evidence exists.

## Multi-Part Model Evidence Policy
Multipart model behavior should be handled as a generic vanilla-compatible pattern.

Evidence should include:

- `multipart` entries and their `when` conditions.
- Variant or model entries used by each part.
- Rotation, uv lock, and weighted model declarations.
- Properties declared by the block state definition.
- Source code that declares or mutates the matching block state properties.
- Any renderer or model hook that bypasses vanilla multipart evaluation.

The MCP should summarize the condition graph instead of copying the JSON. It should show unresolved properties, missing models, and texture references first because those are the highest-signal failure modes.

## Registry Wiring Evidence Policy
Visual systems depend on registry wiring. For a visual task, the MCP should gather registry evidence for the relevant object family:

- Blocks and their block state properties.
- Items and item-block links.
- Block entities and valid block bindings.
- Menu types and screen bindings.
- Entity types and entity renderer bindings.
- Client initialization hooks that register render layers, renderers, screens, color handlers, model loaders, or special model hooks.
- Resource location names used across Java, JSON, and language files.

The system should report mismatches as evidence, not speculation. Examples include a block entity registered for the wrong block set, a menu without a client screen binding, a renderer registered only on the wrong side, or an asset namespace that differs from the registry name.

## Block Entity Renderer Basics
A block entity renderer requires four evidence links:

- A block entity type registered and bound to one or more blocks.
- A client-only renderer registration that binds that block entity type to a renderer factory.
- Assets or model data used by the renderer, such as textures, models, baked sprites, or generated mesh data.
- A sync path for all data the renderer reads on the client.

Renderer registration must run only in client initialization. Shared registration code may declare the block entity type, but renderer binding must stay behind a client boundary.

Renderer code should not read server-only state directly. If a visual value can change during play, evidence must show how it reaches the client. Common paths include update tags, block update packets, entity data, menu data slots, custom packets, or model data invalidation.

The MCP should flag missing or ambiguous data sync as a first-order risk. A renderer that works only after world reload, shows stale state, or crashes on a dedicated server often lacks a clear client/server boundary or sync path.

## Entity Renderer Evidence Policy
For entity renderer tasks, the route should collect:

- Entity type registration.
- Client renderer registration.
- Model layer, baked layer, texture, and animation references.
- Entity data accessors or packets used by the renderer.
- Spawn packet or tracking behavior when relevant.
- Language, item, egg, or particle assets if the visual task includes inventory or feedback surfaces.

The MCP should keep entity renderer evidence separate from block entity renderer evidence. They share client-only registration concerns, but their lifecycle and sync paths differ.

## Harness And Tool Priority Rules
The harness should route client visual questions with this priority:

1. Local project context and task intent.
2. Local generated metadata, indexed source, and registry summaries.
3. Resource-pack asset index and reference trace.
4. Explicit source or JSON reads for the smallest relevant files.
5. Versioned official or curated documentation.
6. General explanation only after evidence is exhausted.

The MCP should keep one progressive public route as the default. Specialized internals may exist, but the harness should prefer a single evidence plan that combines source, registry, and asset evidence.

If local evidence conflicts with docs, local evidence wins for the current workspace. The answer should state the conflict and avoid replacing local facts with generic patterns.

## Token-Budget Rules
Client visual tasks can explode context quickly. The MCP should enforce these defaults:

- Return counts before paths.
- Return bounded samples before full lists.
- Read one narrow source or JSON file before reading a directory.
- Prefer reference traces over raw JSON dumps.
- Summarize binary assets as metadata only.
- Cap language entries to matching keys and short values.
- Include provenance for every evidence group.
- Mark truncated output explicitly.

The harness should request deeper reads only after the first evidence pass identifies a narrow target, such as one registry name, one screen class, one model path, or one renderer binding.

## Future Implementation Slices
### Slice 1: Client Visual Evidence Route
Add a route classifier for client visual tasks that combines registry, source, and resource-pack asset evidence. Tests should assert that screen, menu, renderer, and model prompts choose the evidence route before generic docs.

### Slice 2: Registry-To-Asset Reference Summary
Add a compact summary that links block, item, block entity, menu, and entity names to candidate asset namespaces and paths. Tests should cover matching names, namespace mismatches, missing assets, and counts-only output.

### Slice 3: Renderer Binding Summary
Add an internal summary for block entity renderer and entity renderer registrations. Tests should verify client-only registration detection, binding-to-type relationships, and missing binding diagnostics.

### Slice 4: Multipart And Connected-Pattern Trace
Add JSON reference tracing for multipart blockstates and connected-texture-like asset families. Tests should verify static multipart conditions, runtime model hook hints, unresolved properties, and bounded output.

### Slice 5: Data Sync Evidence
Add a renderer data sync checklist that can identify update tags, packets, entity data, menu data slots, and model data invalidation. Tests should include stale-render-risk diagnostics when a renderer reads mutable data without visible sync evidence.

### Slice 6: Verification Fixtures
Add anonymized fixtures for screens, menus, block entity renderers, entity renderers, multipart models, and asset graphs. Fixtures must use invented names and minimal JSON or source snippets written for the tests.

### Slice 7: UI, Render Pipeline, And Shader Evidence
Add compact source evidence for UI layout/widgets, render pipeline state, and shader/post-processing chains. Tests should verify that the source scanner, API proof, and implementation skeleton distinguish UI layout from renderer state and shader ownership.

### Slice 8: External Shader Reference Provider
Design an optional internal provider for external shader formula/reference lookup. Tests should verify API-key lookup, no-key browser fallback guidance through Chrome DevTools or Playwright, no public-tool expansion, and conversion from external shader concepts into Minecraft uniforms, samplers, render target, and reload evidence.

### Slice 9: Version-Resilient Visual API Mapping
Add harness and docs behavior that treats version-specific class names as evidence, not assumptions. Tests should simulate a missing familiar GUI/rendering API and require role-equivalent replacement guidance instead of hard-coded class advice.

## Acceptance Criteria
- The spec remains anonymized and generic.
- No implementation-specific project names or local paths appear in the document.
- The MCP guidance prioritizes evidence over generic advice.
- Resource-pack evidence covers blockstates, models, textures, atlases, language files, particles, and sounds where relevant.
- UI evidence covers GUI textures, sprites, stretch/scaling metadata, widget layout, fonts, and language keys.
- Shader evidence covers local shader/post-chain assets, render pipeline owners, uniforms/samplers, reload lifecycle, optional API-key external references, and no-key Chrome DevTools/Playwright browser fallback summaries.
- Renderer basics cover registration, binding, assets, data sync, and client-only boundaries.
- Future slices include testable outcomes.
