# Resource Evidence Parity System Spec
Date: 2026-04-30
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`

## Relationship To Boundary Spec
This spec extends `2026-04-30-resource-pack-ui-boundary-and-evidence-spec.md`.

The boundary spec prevents MCP runtime scope creep into UI/design methodology. This spec defines the positive requirement: `assets/**` resource evidence is a first-class Minecraft development domain, with the same seriousness as datapack `data/**` evidence.

The important distinction is:

- resource support is core infrastructure;
- UI/design advice is not core runtime infrastructure;
- MCP must be strong at finding, indexing, summarizing, and reading resource evidence;
- MCP must not become a generic visual design assistant.

## Problem Statement
Minecraft development and modpack debugging frequently depend on resources, not only code or datapack JSON.

Agents currently risk wasting tokens by:

- searching project source when the answer is in `assets/**`;
- assuming a resource does not exist because only workspace source was searched;
- treating KubeJS, datapack, and resource-pack work as unrelated flows;
- missing assets inside mod JARs, nested JARs, or modpack resource-pack roots;
- falling back to docs before checking concrete resource evidence;
- dumping too many paths or file contents when only compact metadata is needed.

The system needs a rigorous resource evidence layer that gives agents fast, concrete facts about real assets while preserving token budget and privacy.

## Goal
Build resource evidence parity with datapack support.

The MCP should be able to discover, index, summarize, search, and explicitly read `assets/**` resources from local workspaces, resource packs, mod JARs, nested JARs, MDM packages, and locally acquired vanilla assets where available.

The public MCP surface stays progressive and small. The main user-facing path remains `mc_develop`; low-level helpers stay internal unless a later spec proves a public API need.

## Non-Goals
- Do not add a public UI/design MCP tool.
- Do not generate textures, images, or UI art.
- Do not decode PNG pixels or run image analysis in this phase.
- Do not dump binary content into context.
- Do not inject long resource-pack tutorials into runtime prompts.
- Do not commit private modpack-derived indexes, generated caches, or user resource packs into `mdm-sources`.
- Do not make resource docs or external Skills mandatory for basic resource evidence lookup.

## Core Decisions
### 1. `assets/**` Is A First-Class Domain
Resource evidence must not be treated as a small extension of datapacks. The system should eventually provide equivalent quality for:

- root discovery;
- namespace discovery;
- kind classification;
- compact inventory summaries;
- explicit text/JSON reads;
- search by resource location and path;
- cache reuse and invalidation;
- provenance in every result;
- tests with real fixture files.

### 2. Evidence Before Docs
For resource-related requests, local evidence has priority over docs:

1. workspace loose `assets/**`;
2. explicit resource-pack roots;
3. mod JAR `assets/**`;
4. nested JAR or JarJar `assets/**`;
5. installed MDM packages;
6. locally acquired vanilla assets;
7. docs/resource shards as fallback.

Docs are still useful, but they should explain rules after the system has checked concrete files.

### 3. Binary Metadata By Default
Binary resource entries are indexed and summarized as metadata only.

Allowed by default:

- relative path;
- namespace;
- kind;
- size;
- source/provenance;
- fingerprint/cache status;
- optional width/height only in a later spec.

Not allowed by default:

- raw bytes;
- base64;
- image pixel analysis;
- long path dumps;
- large JSON dumps.

### 4. Unified Model Across Loose Files And Archives
Loose resource roots and archived resource entries should share one logical result model. Callers should not need to know whether an asset came from `workspace/assets`, `mods/foo.jar`, `META-INF/jarjar/bar.jar`, or an installed MDM package before they can reason about it.

The physical source remains visible through provenance fields.

## Evidence Sources
### Workspace Resource Roots
Discover resource roots from:

- workspace root with `assets/`;
- nested directories with `pack.mcmeta` and `assets/`;
- known mod project roots such as `src/main/resources/assets`;
- known KubeJS roots if resource assets are present;
- resource-pack folders inside modpack instances.

Discovery must avoid high-noise directories:

- `.git`;
- `node_modules`;
- `dist`;
- `build`;
- generated runtime cache folders unless explicitly requested.

### Mod Archive Assets
The existing `jar-source-adapter` already treats archive content domains as `java`, `data`, `assets`, and `class`. Resource parity requires `assets/**` entries to gain kind classification and compact summaries, not only domain counts.

The system must support:

- top-level mod JAR entries;
- nested JAR entries where existing nested archive support can read them;
- JarJar-style embedded mod archives;
- persistent SQLite indexing for repeated inventory queries.

### MDM Resource Packages
`mdm-sources` remains the public package source for formal packages and manifests. MCP local store owns downloaded packages and derived caches.

Resource packages may include:

- docs shards about resource rules;
- small legal example fixtures;
- schemas or metadata;
- prebuilt public indexes only when license and size make sense.

Resource packages must not include:

- private modpack resources;
- generated user cache;
- large redistributable assets without explicit legal review;
- vanilla assets bundled into the repository.

### Vanilla Assets
Vanilla assets should follow the same principle as vanilla source code: acquire or generate locally on demand when the user explicitly needs them, instead of storing them in the repository.

The MCP may later add a local acquisition pipeline for vanilla assets, but this requires a separate spec covering download source, checksum, license constraints, cache path, and invalidation.

## Logical Data Model
### ResourceRoot
Every discovered root should be representable as:

```ts
interface ResourceRoot {
  rootId: string;
  rootKind:
    | "workspace_assets"
    | "resource_pack"
    | "mod_archive"
    | "nested_mod_archive"
    | "mdm_package"
    | "vanilla_assets";
  absolutePath?: string;
  archivePath?: string;
  embeddedArchivePath?: string;
  packMcmetaPath?: string;
  priority: number;
  fingerprint: string;
  privacy: "workspace_private" | "public_package" | "generated_local";
}
```

### ResourceEntry
Every resource result should be representable as:

```ts
interface ResourceEntry {
  entryId: string;
  rootId: string;
  relativePath: string;
  namespace: string;
  kind: ResourceKind;
  fileType: "json" | "text" | "binary" | "unknown";
  sizeBytes: number;
  provenance:
    | "workspace_resource"
    | "resource_pack"
    | "mod_archive_content"
    | "mdm_package"
    | "vanilla_assets";
}
```

### ResourceKind
P0 can start narrow, but the target taxonomy must cover general Minecraft assets:

```ts
type ResourceKind =
  | "atlases"
  | "blockstates"
  | "font"
  | "lang"
  | "models"
  | "particles"
  | "shaders"
  | "sounds"
  | "textures"
  | "pack_metadata"
  | "other";
```

UI-oriented subkinds such as `gui_texture` and `gui_sprite` may exist as classifier details, but they must be nested under evidence naming and must not imply design-authoring behavior.

## Operations
### Inventory
Inventory returns compact summaries.

Default output should include:

- root counts by `rootKind`;
- entry counts by `ResourceKind`;
- namespace counts;
- cache status;
- truncation flags.

Default output should not include:

- all paths;
- full JSON content;
- binary content.

### List
List returns bounded paths and metadata. It must require explicit filters or strict limits.

Supported filters should include:

- namespace;
- kind;
- root kind;
- source archive;
- path prefix;
- file type.

### Search
Search should support:

- exact resource location such as `demo:gear`;
- path substring;
- JSON/text content search;
- reference search in JSON/text files.

Binary files participate only through path and metadata until a later spec adds safe metadata readers.

### Read
Read requires explicit path or selected entry id.

Allowed:

- JSON files under byte budget;
- text files under byte budget;
- metadata-only response for binary files.

Skipped responses must include reason:

- `not-found`;
- `binary`;
- `too-large`;
- `unreadable`;
- `outside-root`.

## Harness And Routing
Resource evidence should be routable without exposing many tools.

The harness should detect resource intent from:

- explicit `assets/...` paths;
- resource locations such as `namespace:path`;
- words like resource pack, texture, model, blockstate, atlas, lang, font, particle, shader, sound;
- crash/log signals related to missing resources, model loading, texture stitching, invalid JSON, or namespace resolution;
- KubeJS/datapack tasks that reference resource locations.

Route behavior:

- if concrete workspace resource roots exist, check them before docs;
- if mod archives exist and request mentions external mod assets, check mod archive asset index before docs;
- if only docs packages exist, docs remain fallback and must be labeled as not concrete workspace evidence;
- if no evidence exists, say what was checked and what capability is missing.

## Cache And Performance
Resource indexing must be bounded and explicit.

Default budgets:

- inventory: counts only;
- list: small fixed limit;
- search: bounded file count and byte count;
- read: bounded bytes per file;
- binary: metadata only.

SQLite indexes are allowed and expected for:

- repeated mod archive inventory;
- resource root inventory;
- namespace/kind counts;
- path lookup;
- cache fingerprints.

Cache invalidation must consider:

- file size;
- mtime;
- package manifest version;
- archive path;
- embedded archive path;
- schema version.

The system may spend extra CPU or disk for speed only when the operation is explicit, cacheable, and observable in trace output.

## Privacy And Repository Boundaries
Private and generated resource evidence must stay local.

Allowed in repository:

- schema;
- code;
- tests;
- small synthetic fixtures;
- docs;
- package manifests;
- legal public package metadata.

Not allowed in repository:

- user modpack resources;
- private resource packs;
- generated SQLite caches from user workspaces;
- large vanilla assets;
- binary mod assets copied from third-party mods.

## Interaction With Existing Packages
### `@mcpskill/datapack-adapter`
Current adapter already discovers `data/**` and `assets/**` roots, lists files, searches text, and reads budgeted text files. Resource parity work should either extend this package or create a sibling resource adapter only if the responsibilities become too large.

Required improvements:

- richer `AssetKind`;
- root kind/provenance separation;
- resource-pack root detection;
- compact summary API;
- stricter binary metadata handling;
- tests for resource-only workspaces.

### `@mcpskill/jar-source-adapter`
Current adapter already sees archive domains and has persistent mod archive entry indexing. Resource parity work should add kind classification and summary fields without turning archive inventory into a path dump.

Required improvements:

- asset kind classifier;
- aggregate summary query;
- optional filters by resource kind;
- nested archive parity;
- schema migration with explicit column detection;
- no file over 500 lines.

### `apps/mcp-server`
MCP should keep `mc_develop` as the public entry.

Required improvements:

- evidence provenance may need `resource_files` or clearer split from `datapack_files`;
- inventory payload must include compact resource summaries;
- explicit reads/searches must retain existing budgets;
- structured content must keep truncation trace;
- public API tests must prevent tool sprawl.

### `@mcpskill/service-profile`
Service profile may report resource capability status and short evidence guidance.

Allowed guidance:

```text
Use local assets/resource-pack evidence before docs for resource paths and namespaces.
```

Not allowed guidance:

```text
Use nine-slice and grid layout to design dynamic windows.
```

## Phases
### P0: Mod Archive Asset Evidence
This is the currently planned implementation slice.

- Classify selected mod JAR `assets/**` paths.
- Add SQLite `asset_kind`.
- Return counts-only `assetResourceSummary`.
- Add tests proving default inventory does not dump paths.

### P1: Loose Resource Roots And General Asset Kinds
This is required follow-up work.

- Extend loose file discovery for resource-pack roots and workspace `assets/**`.
- Add general `ResourceKind` taxonomy.
- Add compact resource summaries parallel to datapack summaries.
- Add explicit JSON/text reads for common resource files.
- Add routing for resource intent before docs.

### P2: Unified Resource Evidence API
- Unify loose roots, archive entries, MDM packages, and locally acquired vanilla assets behind one internal model.
- Add path/resource-location search across sources.
- Add provenance-rich structured content.
- Add real modpack fixture tests.

### P3: Optional Advanced Metadata
Requires separate specs.

- PNG header width/height extraction.
- Atlas/font structured summaries.
- Safe sound metadata.
- Vanilla asset acquisition pipeline.
- Resource docs shard expansion in MDM packages.

## Testable Constraints
Any implementation of this spec must prove:

- `mc_develop` remains the public progressive entry;
- resource support does not add a public UI/design tool;
- `assets/**` gets equivalent discovery and evidence treatment to `data/**`;
- default payloads are compact summaries;
- path lists are bounded and request-driven;
- text/JSON reads are explicit and byte-limited;
- binary files are metadata-only by default;
- every result includes provenance;
- docs lookup remains fallback after local evidence;
- private/generated caches stay local;
- source and test files stay under 500 lines;
- Go files and Go module files do not reappear.

## Open Questions
- Should `datapack_files` be renamed internally to a broader `resource_files` route, or should a new internal route be added while keeping public `mc_develop` unchanged?
- Should loose resource-pack indexing live inside `@mcpskill/datapack-adapter`, or should it become `@mcpskill/resource-adapter` once the model grows?
- Which real modpack fixture should become the first non-private integration target for resource roots?
- What is the legal and technical path for on-demand vanilla asset acquisition?

## References
- `docs/superpowers/specs/2026-04-30-resource-pack-ui-boundary-and-evidence-spec.md`
- `docs/superpowers/specs/2026-04-26-agentic-bottom-layer-services-design.md`
- `docs/superpowers/specs/2026-04-19-mdm-sources-registry-and-mcp-cache-design.md`
- `packages/datapack-adapter/src/types.ts`
- `packages/datapack-adapter/src/discovery.ts`
- `packages/datapack-adapter/src/files.ts`
- `packages/jar-source-adapter/src/archive-content.ts`
- `packages/jar-source-adapter/src/mod-archive-entry-index.ts`
- `apps/mcp-server/src/source-bundle-datapack.ts`
- `apps/mcp-server/src/evidence-plan.ts`
