# Minecraft Rendering Pipeline Reference (Forge 1.20.1 / NeoForge 1.21.1)
This document maps client rendering architecture for Forge 1.20.1 and NeoForge 1.21.1.
It focuses on flow, registration points, and version-aware hooks.

## Scope and invariants
- Rendering code is client-only on both loaders.
- Static world geometry is model-bake driven.
- Dynamic visuals use renderer classes (`BlockEntityRenderer`, `EntityRenderer`).
- NeoForge 1.21.1 exposes `ModelEvent.ModifyBakingResult` for runtime bake mutation.

## Block rendering pipeline
### 1) Blockstate and model resolution
- `assets/<modid>/blockstates/<block>.json` maps `BlockState` to model variants or multipart entries.
- `assets/<modid>/models/block/<model>.json` defines geometry, texture slots, parent chain, transforms, and optional `render_type`.
- The engine resolves the active blockstate entry, then builds an unbaked model graph from JSON + parents.

### 2) RenderType selection
- `solid`: opaque pass.
- `cutout`: alpha-tested pass without blending.
- `cutout_mipped`: cutout semantics with mipmap-friendly sampling.
- `translucent`: blended pass, order-sensitive.
- Strategy: set the intended layer from model/render configuration so chunk builders route quads to the correct pass.

### 3) Model bake stage and `BakedModel`
- Resource reload compiles unbaked definitions into `BakedModel` instances.
- `BakedModel` is the runtime quad source used by chunk building and item rendering.
- Face/general quad emission and model flags are fixed at bake output.

### 4) NeoForge bake mutation hook
- NeoForge provides `ModelEvent.ModifyBakingResult` after bake map creation.
- Use it to replace, wrap, or patch baked models at reload time.
- Keep mutations deterministic and scoped to client-side event handling.

## BlockEntityRenderer (BER)
### When BER is the correct tool
- Use BER when visuals depend on runtime state not representable as static baked quads.
- Typical cases: animation, dynamic text/values, fluid level visuals, procedural transforms, effect overlays.
- Keep invariant geometry in JSON models; BER should own only the dynamic slice.

### Registration
- Register BER bindings in `EntityRenderersEvent.RegisterRenderers` on the client mod event bus.
- Bind `BlockEntityType` to a `BlockEntityRendererProvider`.
- Place registration code in client-only classes.

### `render()` method context
- `PoseStack`: local transform stack.
- `MultiBufferSource`: buffer routing by `RenderType`.
- `partialTick`: interpolation between game ticks.
- packed light/overlay: lighting and overlay channels.
- Canonical flow: push pose -> apply transforms -> get `VertexConsumer` -> emit vertices -> pop pose.

### Vertex emission
- Obtain writer via `MultiBufferSource#getBuffer(RenderType)`.
- Emit complete vertex attributes expected by the chosen format/state.
- Keep pass/state alignment correct (blend, depth, cull) to prevent artifacts.

## Entity rendering
### Renderer classes
- Entity renderers extend `EntityRenderer<T>` or specialized subclasses such as `MobRenderer`.
- Renderer responsibilities: transform, texture selection, model invocation, extra render layers.

### Model classes
- `EntityModel<T>` defines base model behavior.
- `HierarchicalModel<T>` supports part-tree traversal and animation-friendly structure.
- Models are baked from layer definitions and consumed by renderer constructors.

### Registration pattern
- Register entity renderers in `EntityRenderersEvent.RegisterRenderers`.
- Bind `EntityType` to renderer factories/providers.
- Register model layer definitions in client layer-definition registration events for the target version.

## Custom `RenderType`
- Create custom `RenderType` only when standard passes cannot represent required state.
- Typical need: custom blend rules, depth writes/tests, culling behavior, shader bindings.
- Document sorting implications for translucent custom passes.

## Shader basics
### Shader registration
- Register shader instances through client shader registration events (for example `RegisterShadersEvent`).
- Store references in client-only holders and expect reload lifecycle invalidation.

### Pipeline layering
- Attach shader state through custom/targeted `RenderType` definitions.
- Keep vertex format, shader input expectations, and state shards aligned.
- Preserve translucent ordering constraints across layered passes.

## Particle rendering
### Core types
- `ParticleProvider<T>` constructs particle instances for a particle type.
- `TextureSheetParticle` is the standard base for texture-sheet billboard particles.

### Runtime path
- Particle render type controls atlas/buffer path and blend/depth state.
- Tick updates mutate lifetime, motion, scale, alpha, and sprite frame.
- Render uses camera-relative interpolation for smooth motion.

## Client-only safety
- All renderer classes, registrations, and shader hooks must load only on the client.
- Do not reference rendering classes from common initialization paths executed on dedicated server.
- Guard registration with client-distribution boundaries (`Dist.CLIENT`, sided subscribers, or equivalent).
- `@OnlyIn` is metadata; safe classloading boundaries are still required.

## Forge 1.20.1 vs NeoForge 1.21.1 quick map
| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Package root | `net.minecraftforge.*` | `net.neoforged.*` |
| BER/entity registration event | `EntityRenderersEvent.RegisterRenderers` | `EntityRenderersEvent.RegisterRenderers` |
| Runtime bake mutation | indirect/limited | `ModelEvent.ModifyBakingResult` |
| Rendering side constraint | client-only | client-only |

## Shader and Post-Processing Pipeline
### Core shader architecture
- `GameRenderer` owns the high-level frame orchestration and coordinates world rendering, hand/item overlays, and post-processing application.
- `ShaderInstance` represents a compiled shader program binding plus uniform/sampler metadata used by active render passes.
- `PostChain` represents the configured post-processing graph attached to a target render path and executed as ordered screen-space passes.
- `EffectInstance` models program state for post effects and links JSON-declared uniform/sampler definitions to runtime shader objects.
- `PostPass` is the per-pass executor that binds input targets, writes output targets, and applies the pass-local effect program.

### Relationship to `RenderType`
- `RenderType` extends `RenderStateShard`, so custom pipeline behavior is composed from state shards (shader, transparency, depth, cull, target, write-mask, layering).
- Custom shader usage is attached through a custom `RenderType` definition rather than ad hoc state mutation during vertex emission.
- The architecture contract is: vertex format + draw mode + shader state shard + fixed-function shards must remain internally consistent.
- For translucent pipelines, define deterministic ordering and target usage up front; post passes should consume already-resolved targets, not unstable in-flight buffers.

### Post-processing chain structure
- Post-processing definitions are data-driven: JSON assets describe targets, passes, shader program names, and uniforms.
- The runtime parses the chain definition into a `PostChain` containing ordered `PostPass` nodes.
- Each pass maps one or more inputs to an output render target, executes `EffectInstance`, then publishes the result for later passes or final compositing.
- This architecture allows reload-safe effect graph replacement during resource reload without changing render-loop control flow.
- Mod-level effect design should treat each pass as immutable configuration plus dynamic uniforms, not mutable global render state.

### GLSL resource and reload lifecycle
- GLSL stage files are resources resolved during shader/effect load; runtime objects are wrappers (`ShaderInstance` or `EffectInstance`), not raw source strings.
- Resource reload is the ownership boundary: stale program references must be considered invalid after reload.
- `GameRenderer` and `PostChain` lifecycles should be treated as reload-coupled graph roots for frame-time shader usage.
- Architecture should separate persistent identifiers (resource locations, pass names) from ephemeral GPU handles.

### Render pipeline hook surface
- Forge 1.20.1 exposes `net.minecraftforge.client.event.RenderLevelStageEvent` as the primary world-stage injection point.
- NeoForge 1.21.1 exposes `net.neoforged.neoforge.client.event.RenderLevelStageEvent` with equivalent stage-oriented intent and package relocation.
- Stage hooks are used to schedule custom draw calls relative to world milestones (sky/weather/translucent/particles/debug-style overlays).
- Hook handlers should remain phase-stable: build or fetch buffers for the current stage, avoid cross-stage state leakage, and restore any temporary GPU state.
- Loader-specific event package roots differ, but the architectural pattern is identical: stage-driven insertion into the frame timeline.

### Practical BER integration patterns (`PoseStack` + `MultiBufferSource`)
- BER logic should treat `PoseStack` as the authoritative local transform scope; push/pop per logical part to avoid transform bleed.
- Route all geometry through `MultiBufferSource` with explicit `RenderType` selection so shader/state affinity is encoded at buffer acquisition time.
- Split static-vs-dynamic responsibilities: baked model handles invariant structure, BER handles stateful overlays/effects/animated attachments.
- Keep BER draw ordering compatible with surrounding stage and pass assumptions; custom translucent BER output should document composition expectations.
- Prefer deterministic buffer writes and bounded per-frame allocations to reduce frame-time jitter during heavy block-entity scenes.

### Key classes and responsibilities
| Class | Role in pipeline |
|---|---|
| `ShaderInstance` | Core render-program wrapper for non-post draw paths |
| `PostChain` | Ordered post-effect graph manager |
| `PostPass` | Single post-effect execution node |
| `EffectInstance` | Post shader/effect program state + uniforms |
| `RenderStateShard` | Base state-shard abstraction used by `RenderType` |

### Forge 1.20.1 vs NeoForge 1.21.1 shader/pipeline notes
| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| World-stage hook class | `net.minecraftforge.client.event.RenderLevelStageEvent` | `net.neoforged.neoforge.client.event.RenderLevelStageEvent` |
| Hook model | Stage-based world render insertion | Stage-based world render insertion |
| Core shader classes | `GameRenderer`, `ShaderInstance`, `PostChain`, `PostPass`, `EffectInstance` | Same core Minecraft-side classes (versioned internals may differ) |
| `RenderType`/state model | `RenderType` built from `RenderStateShard` composition | Same composition model, with loader package relocation for events |
| Compatibility posture | Validate stage timing and pass order in Forge runtime | Re-validate stage timing and package targets after NeoForge migration |

## MCP verification queries
Use MCP queries to validate symbol availability before implementation.

### Shader and post-processing classes
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"GameRenderer","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"PostChain","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"ShaderInstance","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"RenderType","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"PostPass","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"EffectInstance","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"RenderStateShard","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
```

### BER support classes used by shader-aware BER patterns
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"PoseStack","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"MultiBufferSource","version":"1.20.1","loader":"minecraft"}}' | python3 Mc-Skill/mcp_server/server.py
```

### Forge/NeoForge render-stage hook classes
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"RenderLevelStageEvent","version":"1.20.1","loader":"forge"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"RenderLevelStageEvent","version":"1.21.1","loader":"neoforge"}}' | python3 Mc-Skill/mcp_server/server.py
```

### BER and entity registration event
```json
{
  "method": "search_methods",
  "params": {
    "query": "RegisterRenderers",
    "version": "1.20.1"
  }
}
```
```json
{
  "method": "search_methods",
  "params": {
    "query": "RegisterRenderers",
    "version": "1.21.1"
  }
}
```

### NeoForge bake mutation hook
```json
{
  "method": "search_methods",
  "params": {
    "query": "ModifyBakingResult",
    "version": "1.21.1"
  }
}
```

### Particle rendering classes
```json
{
  "method": "search_methods",
  "params": {
    "query": "ParticleProvider TextureSheetParticle",
    "version": "1.21.1"
  }
}
```

### Rendering docs coverage (docs DB)
```json
{
  "method": "search_methods",
  "params": {
    "query": "modelextensions modelloaders entities renderer rendering particles",
    "version": "docs"
  }
}
```
