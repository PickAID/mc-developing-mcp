<!-- markdownlint-disable MD013 MD022 MD032 -->

# Client Visual Evidence Standard
Date: 2026-05-05
Author: m1hono
Scope: `mc-developing-mcp` client visual, rendering, resource-pack, registry, and UI evidence

## Purpose

Client visual work is not a single resource-pack lookup. It is a cross-domain engineering problem that spans registries, Java or KubeJS source, client-only initialization, resource-pack assets, model/reference graphs, renderer bindings, and data synchronization.

This standard defines what the MCP must gather, how it must rank evidence, and what an agent answer must prove before it gives advice. It is intentionally generic and must not expose implementation-specific project names, local paths, or copied source.

## Required Outcome

For any client visual task, the MCP should move the agent from vague advice to a grounded evidence chain:

```text
request intent
-> workspace facts
-> relevant source or script surface
-> registry object family
-> client binding or client init path
-> asset/reference graph
-> data sync path if runtime state is rendered
-> docs only for version-specific gaps
```

An answer is incomplete if it only says "register a renderer" or "check the JSON". It must say which evidence was proven, which evidence was not proven by the current bounded scan, and what risk follows from that unproven link.

## Intent Scope

The `client_visual_resources` intent covers:

- Screens, menus, widgets, overlays, HUD-style client UI, and GUI textures.
- Block entity renderers and special block visual systems.
- Entity renderers, model layers, textures, animations, and renderer factories.
- Blockstates, models, item model definitions, multipart models, parent models, textures, atlases, particles, sounds, fonts, and lang keys.
- Connected-resource or connected-texture-like visual systems, whether data-driven or runtime-driven.
- Registry wiring for blocks, items, block entities, entity types, menus, render layers, screen bindings, model loaders, color handlers, and renderer bindings.
- KubeJS client visual scripting when `client_scripts`, ProbeJS, assets, or registry evidence are involved.

The intent does not cover pure art critique, image generation, texture editing, generic CSS/UI design, or subjective layout coaching unless the user explicitly asks for design guidance.

## Evidence Priority

The evidence priority is mandatory:

1. Workspace detector facts and runtime version/loader.
2. Local source, KubeJS scripts, ProbeJS/d.ts, and Gradle source/JAR evidence.
3. Registry declarations and resource location names.
4. Resource-pack assets and reference traces.
5. Mod archive `assets/**`, `data/**`, nested JarJar content, and class owner evidence.
6. Versioned official or curated docs.
7. General explanation only after local evidence is absent or exhausted.

Local evidence wins over docs. If docs say a pattern is typical but the workspace uses another pattern, the answer must describe the local pattern first.

## Minimum Evidence Packet

The first pass for a client visual task should return a compact evidence packet with these fields where available:

```json
{
  "intent": "client_visual_resources",
  "runtime": {
    "minecraftVersion": "known-or-unknown",
    "loader": "known-or-unknown"
  },
  "workspaceEvidence": {
    "hasJavaSource": true,
    "hasKubeJS": false,
    "hasProbeJS": false,
    "hasResourcePack": true,
    "hasModArchives": true
  },
  "sourceEvidence": {
    "candidateRegistries": 0,
    "candidateClientInit": 0,
    "candidateRendererBindings": 0,
    "candidateSyncPaths": 0
  },
  "assetEvidence": {
    "namespaces": [],
    "byKind": {},
    "referenceTraceAvailable": false,
    "binaryContentReturned": false
  },
  "missingEvidence": [],
  "nextReads": []
}
```

The packet should favor counts, kinds, and reasons before long path lists. A second pass may read exact files once the target registry name, renderer name, asset path, or script scope is known.

## Resource-Pack Evidence

Resource-pack assets are implementation evidence. The MCP must treat them as first-class and separate them from datapack data even when the current internal route step is still named `datapack_files`.

Required asset kinds:

- `blockstates`
- `models`
- `textures`
- `items`
- `atlases`
- `lang`
- `font`
- `particles`
- `sounds`
- `shaders`
- `connected_texture_metadata`
- `custom_model_format`
- `block_entity_renderer_asset`
- `pack_metadata`

Default behavior:

- Return `byNamespace` and `byKind` counts.
- Return bounded samples only when they help pick the next read.
- Do not return binary texture bytes.
- Do not infer behavior from file names alone.
- Preserve provenance: workspace root, generated resources, main resources, mod archive, nested archive, generated vanilla package, or optional docs package.

Required reference traces:

- Blockstate -> model.
- Item definition or item model -> model.
- Model -> parent model.
- Model -> texture.
- Particle -> texture.
- Font -> bitmap provider assets.
- Atlas -> sprite source directories or explicit files.
- Lang key -> screen/item/block/subtitle/tooltip usage when text is relevant.

## Registry-To-Asset Standard

Visual answers must connect registry names to assets whenever possible. The MCP should identify mismatches between:

- Java/KubeJS registry ID and asset namespace.
- Block ID and `assets/<namespace>/blockstates/<path>.json`.
- Item ID and item model/item definition path.
- Block entity type binding and renderer asset namespace.
- Menu type and screen title/lang key.
- Entity type and renderer texture/model layer.

Mismatches are high-signal diagnostics. The agent should not silently normalize or "fix" names in prose; it must report the mismatch as evidence.

## Client Initialization Standard

Client-only work must be proven by evidence. The MCP should search for:

- Client mod initializer or client setup event.
- Dist/client-only event subscriber.
- Renderer registration calls.
- Screen registration calls.
- Render layer registration.
- Color handler registration.
- Model loader or special model registration.
- Entity renderer registration.
- Block entity renderer registration.

The answer must flag any renderer or screen binding that appears in common/shared initialization without a client boundary. Dedicated-server crash risk is a first-order issue, not a side note.

## Screen And Menu Standard

For screen/menu work, the required evidence chain is:

```text
menu type registry
-> server-side menu/container class
-> open path or network path
-> client screen binding
-> screen constructor signature
-> synced state path
-> lang title/buttons/tooltips
-> GUI textures/sprites/fonts
```

The MCP should distinguish:

- Menu logic evidence: slots, data slots, access checks, server state.
- Screen rendering evidence: screen class, widget layout, rendering calls, texture/sprite references.
- Sync evidence: data slots, packets, entity data, block entity tags, or explicit client cache.
- Asset evidence: GUI textures, sprites, atlas entries, fonts, and lang.

Invalid answer patterns:

- Recommending a screen registration without checking a menu type.
- Assuming a texture path from a class name.
- Ignoring synced state when the UI displays mutable values.
- Giving generic widget code without checking the target MC version.

## Block Entity Renderer Standard

Block entity renderer evidence requires four linked facts:

1. Block entity type registration.
2. The set of blocks bound to that block entity type.
3. Client-only renderer binding for that block entity type.
4. Client-side data source for every mutable value read by the renderer.

The MCP should classify risks:

- `missing_renderer_binding`: block entity exists but renderer binding is absent.
- `wrong_block_binding`: block entity type does not include the visual block.
- `side_boundary_risk`: renderer binding appears in shared/server code.
- `missing_sync_path`: renderer reads mutable data without visible client sync.
- `asset_mismatch`: renderer texture/model namespace does not match registered object.
- `stale_render_risk`: data updates exist but no invalidation/update signal is visible.

The answer must say whether the renderer appears static, blockstate-driven, block-entity-data-driven, model-data-driven, or packet-driven.

## Entity Renderer Standard

Entity renderer evidence requires:

- Entity type registration.
- Client renderer registration.
- Model layer, baked model, or model class evidence.
- Texture path or texture selection logic.
- Entity data accessors or packets for rendered mutable state.
- Spawn/tracking behavior when initial visual state can differ per entity.
- Related assets such as spawn egg/item/lang/particles when relevant.

Entity renderer and block entity renderer evidence must not be merged. They share client-only registration concerns but have different lifecycle, sync, and model systems.

## Connected-Resource Pattern Standard

Connected-resource systems must be treated as a generic pattern. The MCP must not assume one library or one implementation style.

The evidence pass should decide which of these strategies the workspace uses:

- Static multipart blockstate selection.
- Static variant property selection.
- Resource-pack metadata-driven connected textures.
- Runtime baked-model selection.
- Runtime block entity renderer.
- Runtime model-loader or special model hook.
- KubeJS or addon-driven generated assets.

Required facts:

- Target block family or item family.
- State/property/neighbor/data source used for visual choice.
- Asset family count and kind.
- Texture atlas participation.
- Runtime hook or absence of runtime hook.
- Missing models/textures/properties.

The final answer must not blur static JSON selection and runtime selection. If evidence is insufficient, the answer should say which read is needed next.

## Multipart Model Standard

For multipart models, the MCP should summarize:

- Blockstate properties referenced by `when`.
- Conditions and logical combinations.
- Model paths selected by each part.
- Rotation, uvlock, and weight values.
- Source code or script where matching block state properties are declared.
- Missing or unused properties.
- Missing model or texture references.

The output should be a condition graph, not a raw JSON dump, unless the user asks for the exact file.

## Data Synchronization Standard

Any rendered value that can change after initial load requires sync evidence.

Accepted sync evidence:

- Block entity update tag.
- Block update packet.
- Custom network packet.
- Entity data accessor.
- Menu data slot.
- Container data.
- Model data invalidation.
- Resource reload listener for asset-driven state.
- Client cache invalidation path.

If no sync path is visible, the answer must warn that the renderer may show stale values, only update after reload, or crash if server-only state is read client-side.

## KubeJS Client Visual Standard

KubeJS client visual tasks must use both KubeJS scope evidence and resource evidence:

- `client_scripts` controls client-only KubeJS behavior.
- `startup_scripts` controls registration-time behavior.
- `server_scripts` controls recipes/events/server lifecycle and should not be treated as a client renderer surface.
- ProbeJS/d.ts evidence must be preferred before generic JS assumptions.
- Resource-pack assets still matter even if the task is written in KubeJS.

The agent must not treat KubeJS as a Node.js project. It must not recommend package imports, module exports, build steps, or browser/Node APIs unless workspace evidence proves they exist.

## Performance And Token Budget

Client visual evidence can be large. Default budgets:

- Count and classify first.
- Read exact paths only after the user or first pass narrows the target.
- Prefer graph traces over raw JSON.
- Do not read binary textures.
- Cap samples per namespace and kind.
- Reuse persistent mod archive and resource indexes when available.
- Use in-memory cache for repeated evidence in one request.
- Release large content caches after request completion unless configured as persistent indexes.

Allowed extra performance cost:

- If the user asks for deep diagnosis, the MCP may spend more CPU to build a registry-to-asset graph.
- If a crash or missing texture trace names a path, the MCP may read neighboring referenced JSON files.
- If a modpack has many JARs, the MCP should use indexed summaries before full archive reads.

Not allowed:

- Dumping complete asset trees by default.
- Returning all texture paths when only a model path is relevant.
- Reading all JAR entries into token context.
- Returning raw binary or large generated JSON without explicit need.

## Agent Answer Standard

A compliant answer should contain:

- What local evidence was found.
- What evidence was missing.
- The likely failure point or implementation point.
- The smallest next read or change.
- Version/loader caveat if relevant.

A non-compliant answer:

- Gives generic renderer registration advice without checking bindings.
- Gives asset naming advice without checking registry IDs.
- Treats resource packs as decorative instead of implementation evidence.
- Treats KubeJS as generic JavaScript.
- Ignores client/server boundaries.
- Ignores data sync for mutable rendered state.

## Implementation Requirements For The MCP

Current route-level support is not enough. To satisfy this standard, later slices must implement:

1. Registry-to-asset summary.
2. Renderer binding summary.
3. Client initialization boundary summary.
4. Asset reference graph for blockstate/model/item/atlas/font/particle/lang.
5. Connected-resource strategy classifier.
6. Renderer data-sync evidence checklist.
7. KubeJS client visual scope integration.
8. Counts-first MCP structured content for the whole evidence packet.

These should remain internal evidence capabilities behind the progressive public MCP surface unless a future review proves a new tool is necessary.
