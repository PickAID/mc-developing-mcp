# Vanilla Asset Format Coverage Spec
Date: 2026-04-30
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`

## Relationship To Resource Evidence Specs
This spec extends:

- `docs/superpowers/specs/2026-04-30-resource-evidence-parity-system-spec.md`
- `docs/superpowers/specs/2026-04-30-resource-pack-ui-boundary-and-evidence-spec.md`

The parity spec says `assets/**` is a first-class evidence domain. This spec defines how broad and deep the format coverage must become.

The target is not "GUI resource support". The target is versioned, vanilla-aware coverage of Minecraft client resource formats, with enough structure for agents to answer practical modding, modpack, KubeJS, datapack/resource-pack, and crash-triage questions without guessing.

## Research Baseline
At drafting time, the official Mojang Piston manifest reports latest release `26.1.2` and latest snapshot `26.2-snapshot-5`.

The `26.1.2` official client JAR includes these observed `assets/minecraft/*` root categories:

| Category | Observed Count | Main File Types |
| --- | ---: | --- |
| `textures` | 4019 | `.png`, `.png.mcmeta` |
| `models` | 3679 | `.json` |
| `items` | 1507 | `.json` |
| `blockstates` | 1171 | `.json` |
| `particles` | 107 | `.json` |
| `shaders` | 92 | `.vsh`, `.fsh`, `.glsl` |
| `equipment` | 46 | `.json` |
| `atlases` | 16 | `.json` |
| `font` | 9 | `.json` |
| `post_effect` | 7 | `.json` |
| `texts` | 5 | `.txt`, `.json` |
| `waypoint_style` | 3 | `.json` |
| `lang` | 3 | `.json` |
| root metadata | 2 | `gpu_warnlist.json`, `regional_compliancies.json` |

The official asset index for the same release contains launcher-managed external assets, mostly `minecraft/sounds`, `minecraft/lang`, selected `minecraft/textures`, `realms`, `icons`, and `pack.mcmeta`.

Therefore, complete vanilla asset support must combine:

- version manifest metadata;
- asset index objects;
- client JAR `assets/**`;
- locally acquired/generated vanilla asset cache;
- loader/source-code-derived schema details.

## Core Decisions
### 1. Generate The Catalog Per Version
Do not hand-maintain one static list of "supported vanilla asset files".

For each Minecraft version, MCP should be able to generate a local catalog from:

- official version manifest;
- asset index;
- client JAR central directory;
- local source/decompiled code if available;
- small schema extractors maintained in TypeScript.

The generated catalog is local derived data. It should not be committed unless it is a tiny synthetic fixture or legal public package artifact.

### 2. Support Formats By Semantics, Not Just Extensions
`.json` is not one format. The resource system must classify by path and semantic loader:

- `blockstates/*.json` is blockstate variant/multipart data;
- `models/**/*.json` is Java block/item model data;
- `items/*.json` is client item model definition data;
- `atlases/*.json` is atlas source data;
- `font/**/*.json` is font provider data;
- `particles/*.json` is particle sprite data;
- `equipment/*.json` is equipment layer data;
- `post_effect/*.json` is post-processing pipeline data;
- `waypoint_style/*.json` is waypoint sprite style data;
- `lang/*.json` is translation data.

Agents should see these as distinct formats with distinct references and validation rules.

### 3. Blockbench Is An Authoring And Interop Source
`.bbmodel` is not a vanilla runtime resource format. It is still important because many modders author vanilla Java block/item models through Blockbench.

The system should support `.bbmodel` as:

- source evidence for authoring projects;
- an import/export compatibility signal;
- a texture dependency extractor;
- a way to understand Java model elements, display transforms, textures, overrides, and project metadata;
- a bridge between Blockbench projects and vanilla `models/**/*.json`.

It must not treat `.bbmodel` as a file Minecraft loads directly.

## Vanilla Format Taxonomy
### Pack Root
Support:

- `pack.mcmeta`;
- `pack.png`;
- root metadata files observed in client JAR when present.

Required extraction:

- pack format number;
- supported formats/ranges when present;
- description text;
- overlays/filters when present;
- pack icon metadata.

### `assets/<namespace>/atlases/**/*.json`
Purpose: texture atlas source definitions.

Required extraction:

- `sources.length`;
- source `type` values;
- referenced directories;
- referenced single resources;
- prefixes;
- missing reference candidates.

Known source shapes to support initially:

- `minecraft:directory`;
- `minecraft:single`;
- additional source types discovered from the version's client source/catalog.

### `assets/<namespace>/blockstates/**/*.json`
Purpose: blockstate-to-model resolution.

Required extraction:

- `variants` keys;
- `multipart` cases;
- model references;
- rotations `x` and `y`;
- `uvlock`;
- `weight`;
- property names used in variant selectors;
- unresolved model references.

This format is critical for crash triage and "why is my block missing model/texture" tasks.

### `assets/<namespace>/models/**/*.json`
Purpose: Java block/item model definitions.

Required extraction:

- `parent`;
- `textures`;
- texture variable indirection such as `#layer0`;
- `elements`;
- faces and per-face texture references;
- `display`;
- `gui_light`;
- `ambientocclusion`;
- `texture_size`;
- model overrides when present in older or modded content;
- parent chain resolution under budget.

Model support must handle both vanilla files and Blockbench Java model exports.

### `assets/<namespace>/items/**/*.json`
Purpose: modern client item model definitions.

Observed top-level model dispatch types in `26.1.2` include:

- `minecraft:model`;
- `minecraft:select`;
- `minecraft:special`;
- `minecraft:composite`;
- `minecraft:condition`;
- `minecraft:range_dispatch`.

Nested or special model types observed include:

- `minecraft:banner`;
- `minecraft:bed`;
- `minecraft:bundle/selected_item`;
- `minecraft:chest`;
- `minecraft:conduit`;
- `minecraft:copper_golem_statue`;
- `minecraft:decorated_pot`;
- `minecraft:dye`;
- `minecraft:firework`;
- `minecraft:grass`;
- `minecraft:head`;
- `minecraft:map_color`;
- `minecraft:potion`;
- `minecraft:shield`;
- `minecraft:shulker_box`;
- `minecraft:trident`.

Observed dispatch properties include:

- `minecraft:block_state`;
- `minecraft:broken`;
- `minecraft:bundle/has_selected_item`;
- `minecraft:charge_type`;
- `minecraft:compass`;
- `minecraft:context_dimension`;
- `minecraft:crossbow/pull`;
- `minecraft:display_context`;
- `minecraft:fishing_rod/cast`;
- `minecraft:has_component`;
- `minecraft:local_time`;
- `minecraft:time`;
- `minecraft:trim_material`;
- `minecraft:use_cycle`;
- `minecraft:use_duration`;
- `minecraft:using_item`.

The catalog generator must not assume this list is complete. It must scan vanilla item definitions and, when source is available, item model codec registrations.

### `assets/<namespace>/textures/**/*.png`
Purpose: image assets.

Default support:

- path;
- namespace;
- kind/subkind;
- size bytes;
- optional `.png.mcmeta` companion;
- reference relationships from models, atlases, particles, waypoint styles, fonts, and UI files.

Deferred support:

- PNG width/height;
- animation frame dimensions;
- pixel analysis;
- color analysis.

No binary content should be injected into context.

### `assets/<namespace>/textures/**/*.png.mcmeta`
Purpose: texture metadata.

Required extraction:

- animation metadata;
- interpolation flag;
- frame list or frame time when present;
- texture metadata such as mipmap strategy when present;
- relation to the sibling `.png`.

### `assets/<namespace>/font/**/*.json`
Purpose: font providers.

Required extraction:

- provider count;
- provider `type`;
- referenced textures or include ids;
- filters;
- character ranges when compactly summarizable.

Initial provider families:

- `reference`;
- `bitmap`;
- `space`;
- `ttf`;
- `unihex`;
- version-discovered provider types.

### `assets/<namespace>/lang/**/*.json`
Purpose: translations.

Required extraction:

- locale id;
- translation key count;
- bounded key lookup;
- missing key evidence for item/block/resource names;
- duplicate or malformed JSON diagnostics.

Default output must summarize counts, not dump the whole language file.

### `assets/<namespace>/sounds.json` And `assets/<namespace>/sounds/**/*`
Purpose: sound event definitions and sound files.

Required extraction:

- sound event ids;
- referenced sound file paths;
- subtitles;
- stream flag;
- replace flag;
- sound metadata such as volume/weight/pitch when present.

Binary sound files are metadata-only by default.

### `assets/<namespace>/particles/**/*.json`
Purpose: particle texture lists.

Required extraction:

- texture references;
- unresolved sprite references;
- relation to atlas/texture paths.

### `assets/<namespace>/equipment/**/*.json`
Purpose: equipment rendering layers.

Required extraction:

- layer keys such as humanoid variants;
- texture references;
- dyeable or trim-related signals when present;
- unresolved texture references.

### `assets/<namespace>/shaders/**/*`
Purpose: shader source and includes.

Required extraction:

- shader stage from `.vsh` or `.fsh`;
- include graph for `.glsl`;
- referenced shader names from post effects;
- bounded text read under explicit request.

Shaders can be large and technical. Default inventory should only summarize counts.

### `assets/<namespace>/post_effect/**/*.json`
Purpose: post-processing pipelines.

Required extraction:

- targets;
- passes;
- vertex shader references;
- fragment shader references;
- inputs;
- outputs;
- uniforms summarized by name/type.

### `assets/<namespace>/texts/**/*`
Purpose: client text resources.

Required extraction:

- text file kind;
- byte size;
- explicit bounded read only.

### `assets/<namespace>/waypoint_style/**/*.json`
Purpose: waypoint style sprite definitions.

Required extraction:

- sprite references;
- unresolved sprite references.

### Unknown And Modded Formats
Modded resource packs may add paths and JSON formats outside vanilla taxonomy.

The system must:

- preserve unknown entries as `other`;
- expose namespace/path/size/provenance;
- allow explicit bounded text reads;
- avoid false validation errors for modded extensions;
- mark vanilla-format validation as "vanilla-known" rather than absolute.

## Reference Graph Requirements
The system should build a bounded resource reference graph.

Required edges:

- blockstate -> model;
- model -> parent model;
- model -> texture variables and concrete textures;
- item definition -> model/special model;
- item definition -> block model when referenced;
- atlas -> texture directories/singles;
- particle -> texture sprites;
- font -> texture/include/provider references;
- sounds.json -> sound files;
- post_effect -> shaders;
- shader -> included shader snippets;
- equipment -> textures;
- waypoint_style -> sprites;
- `.png.mcmeta` -> sibling `.png`.

Graph queries must be budgeted and traceable.

Example use cases:

- find why a block has a missing purple-black texture;
- find every file involved in `demo:gear`;
- identify whether a mod JAR contains the item model but not the texture;
- prove whether a language key exists before checking docs;
- trace a shader/post-effect failure from a log line.

## Blockbench And `.bbmodel` Support
### `.bbmodel` Evidence
Blockbench project files should be indexed when present in a workspace.

Extract:

- `meta.format_version`;
- `meta.model_format`;
- `resolution`;
- `elements`;
- `outliner`;
- `textures`;
- `texture_groups`;
- `animations`;
- `display`;
- `overrides`;
- selected Java model format when available.

### Java Block/Item Export Compatibility
Blockbench's Java block codec is relevant because it reads and writes vanilla-style model JSON.

The MCP should understand these compatibility points:

- exported `parent`;
- `texture_size`;
- `textures`;
- `elements`;
- face texture links;
- `display`;
- `overrides`;
- `format_version`;
- references from texture ids to Java resource locations.

### Validation Boundaries
Allowed:

- detect that a `.bbmodel` can probably export to Java block/item model JSON;
- extract texture dependencies;
- compare exported model references with actual `assets/**` files;
- warn when `.bbmodel` is being mistaken for a runtime resource.

Not allowed:

- automatically rewrite `.bbmodel` projects without explicit user request;
- claim Minecraft loads `.bbmodel`;
- inject Blockbench UI tutorials into MCP runtime guidance.

## Generated Catalog Artifact
Each version should be able to produce a local derived artifact:

```text
runtime/cache/resource-catalogs/<minecraft-version>/
  manifest.json
  asset-index-summary.json
  client-jar-assets.sqlite
  vanilla-resource-formats.json
  vanilla-reference-rules.json
```

These artifacts are local MCP cache products. They may be regenerated and deleted safely.

`mdm-sources` may publish tiny schema recipes or docs shards, but it should not publish private/generated catalogs by default.

## MCP Behavior
### Inventory Mode
Default resource inventory returns:

- version;
- source set;
- root counts;
- namespace counts;
- format counts;
- cache status;
- truncation flags.

No default path dump.

### Format Detail Mode
When the user asks for a format, return:

- concise format explanation;
- supported path patterns;
- key fields;
- common references;
- local examples if available;
- version provenance.

### Reference Trace Mode
When the user asks "why is this missing", return:

- checked source roots;
- matching candidate files;
- resolved references;
- missing references;
- skipped binary files;
- docs fallback used or not used.

## Tests
Required tests:

- generated catalog sees every top-level `assets/minecraft/*` category in a vanilla fixture;
- every known vanilla JSON category maps to a semantic `ResourceKind`;
- unknown modded paths remain searchable as `other`;
- default inventory does not dump all paths;
- explicit format detail returns bounded field summaries;
- reference graph resolves blockstate -> model -> texture;
- item definition graph resolves condition/select/range/composite models;
- Blockbench `.bbmodel` extraction reports metadata and texture dependencies;
- `.bbmodel` is not classified as a runtime vanilla asset;
- binary files are metadata-only by default;
- source/test files stay under 500 lines.

## Acceptance Criteria
- The system treats vanilla assets as a versioned catalog, not a hardcoded one-off list.
- `assets/**` support covers all observed vanilla root categories for the target version.
- Format detail is semantic and path-aware, not just extension-aware.
- Blockbench support improves authoring evidence without confusing runtime formats.
- Reference graph features are bounded and traceable.
- Public MCP surface remains `mc_develop`-centered.
- UI/design methodology remains outside runtime MCP guidance.

## References
- Mojang Piston version manifest: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- Mojang `26.1.2` asset index: `https://piston-meta.mojang.com/v1/packages/a297059424dfafc8402646b1e8cdea8de2cc9500/30.json`
- Mojang `26.1.2` client JAR: `https://piston-data.mojang.com/v1/objects/4e618f09a0c649dde3fdf829df443ce0b8831e65/client.jar`
- Blockbench `.bbmodel` docs: `https://www.blockbench.net/wiki/docs/bbmodel/`
- Blockbench `.bbmodel` codec source: `https://github.com/JannisX11/blockbench/blob/master/js/formats/bbmodel.js`
- Blockbench Java block codec source: `https://github.com/JannisX11/blockbench/blob/master/js/formats/java/java_block.js`
