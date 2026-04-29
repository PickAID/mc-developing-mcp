# Resource-Pack UI Boundary And Evidence Spec
Date: 2026-04-30
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`

## Problem Statement
The project is expanding from core Minecraft development evidence into modpack JAR caches, datapack lookup, resource-pack/assets lookup, resource packages, and now resource-pack UI/design topics. Resource support is a core requirement, but UI/design topics create a real scope risk: the MCP can drift into a Skill/docs/UI-design bundle instead of staying a progressive Minecraft development evidence system.

The goal is to treat `assets/**` resource support as seriously as `data/**` datapack support, while limiting resource-pack UI/design advice to places where it strengthens the evidence pipeline:

- find real `assets/**` files in mod JARs, resource packs, and datapack/resource roots;
- summarize those resources compactly;
- guide the agent to inspect evidence before giving design advice;
- keep long design methodology in docs/resource packages or external Skills.

The MCP must not become a generic UI design system, a resource-pack authoring platform, or a markdown tutorial injector.

## Core Decision
Resource support is a first-class evidence domain. `assets/**` must be handled with the same engineering seriousness as `data/**`: discovery, indexing, namespace/kind summaries, explicit reads, cache invalidation, traceability, and tests.

Resource-pack UI/design support is allowed only as `asset/resource evidence indexing`.

It may classify and summarize GUI-related assets, but it must not generate subjective design guidance by default. The runtime system may say "inspect these evidence domains first"; it must not teach nine-slice, grid layout, taste, or dynamic-window design in unconditional prompts.

## Subagent Consensus
Four independent subagents reviewed the scope from architecture, data-layer, WIP-risk, and project-focus angles. They agreed on the same boundary:

- the MCP is the evidence/capability layer, not a Skill bundle or UI design curriculum;
- agent harness owns routing, budget, fallback, and trace, not design methodology;
- service-profile guidance must stay short, capability-triggered, and evidence-oriented;
- resource-pack UI knowledge belongs in resource docs/packages or external Skills;
- current implementation work should only reintroduce neutral asset evidence indexing and counts-only summaries;
- `uiResourceIndex`, nine-slice/grid runtime guidance, and new UI/design public tools are scope creep signals.

This consensus is now treated as a project constraint for later implementation work.

## Resource Support Parity With Datapacks
`assets/**` is not an optional decoration layer. It is a core Minecraft development surface parallel to `data/**`.

The detailed resource evidence architecture is defined in `docs/superpowers/specs/2026-04-30-resource-evidence-parity-system-spec.md`. Detailed vanilla asset format coverage is defined in `docs/superpowers/specs/2026-04-30-vanilla-asset-format-coverage-spec.md`.

The system must eventually support resource evidence with the same quality bar used for datapacks:

- discover resources from workspace `assets/`, resource-pack roots, mod JARs, nested JARs, and runtime/modpack locations where available;
- enumerate namespaces and resource kinds with compact summaries;
- read explicit JSON/text resource files under budget, including atlas, font, lang, model, blockstate, particle, shader, and metadata files when supported;
- index binary resource entries as metadata, not token-heavy content;
- cache and invalidate resource indexes by fingerprint;
- preserve source provenance for every resource result;
- include resources in crash/config/modpack triage when missing assets, bad namespaces, invalid model references, or client-side resource failures are relevant;
- keep docs lookup as fallback after local resource evidence.

The boundary is not "resources are small"; the boundary is "resources are evidence, not a bundled UI design curriculum."

## Layer Responsibilities
### MCP
MCP is the capability and execution layer.

It may:

- discover workspace/runtime/modpack context;
- index and query local sources, mod JARs, datapack roots, resource-pack roots, loose `assets/**` roots, and resource package artifacts;
- return bounded `structuredContent` with trace, evidence, cache state, and compact summaries;
- perform explicit, request-driven reads of selected files;
- route through one progressive public tool, `mc_develop`.

It must not:

- expose a set of new public UI/design tools;
- dump long docs or tutorial text into every response;
- infer subjective UI design decisions without evidence;
- require external Skills for core evidence lookup.

### Agent Harness
Agent harness is the strategy and routing layer.

It may:

- detect scenarios and task intent;
- choose route steps and preferred tools;
- enforce evidence-before-docs ordering;
- produce prompt fragments that summarize current route and capability state.

It must not:

- contain a Minecraft UI design curriculum;
- hardcode nine-slice/grid/dynamic-window methodology;
- bypass MCP trace and evidence planning.

### Service Profile
Service profile is a dynamic environment summary, not a tutorial store.

It may inject short capability guidance such as:

- use Gradle/source archives before guessing Java classes;
- use ProbeJS/d.ts before generic JavaScript assumptions for KubeJS;
- use discovered mod JAR data/assets/source content before assuming it is absent.

For resource-pack UI, it may eventually inject a short evidence-ordering sentence only if the implementation has a test and strict length budget:

```text
For resource-pack UI requests, inspect GUI textures, sprites, atlases, fonts, and lang assets before giving design advice.
```

It must not expand this into layout rules or design philosophy.

### Resource Docs And MDM Packages
Resource docs/packages are the right home for longer reference material.

They may contain:

- resource-pack UI workflows;
- nine-slice and grid explanations;
- dynamic window/layout patterns;
- examples for atlas/font/lang files;
- versioned caveats.

MCP should retrieve only relevant structured shards under budget. It should not treat markdown files as runtime content.

### External Skills
External Skills are appropriate for subjective or cross-project design craft.

They may contain:

- visual taste checklists;
- UI composition patterns;
- nine-slice design teaching;
- grid design exercises;
- resource-pack art-direction workflows.

Core MCP correctness must not depend on them.

## Guidance Placement Matrix
| Content | Belongs In MCP Runtime | Belongs In Harness | Belongs In Resource Docs | Belongs In External Skill |
| --- | --- | --- | --- | --- |
| "Mod JAR assets exist; inspect them first" | Yes | Yes, as route preference | Optional | No |
| GUI texture/sprite/atlas/font/lang counts | Yes | No | Optional | No |
| Specific path read for `assets/.../atlases/*.json` | Yes, explicit request | No | No | No |
| Nine-slice concept explanation | No | No | Yes | Yes |
| Grid/dynamic-window design method | No | No | Yes | Yes |
| Visual taste or component composition advice | No | No | Optional | Yes |
| PNG binary/image analysis | No for now | No | Future docs only | Future Skill/tool only |

## Data-Layer Scope
### P0 Allowed
P0 in this plan is evidence indexing only. It starts with high-signal asset kinds inside mod JARs, but this is the first slice of first-class resource support, not the whole resource story.

- Classify paths in mod JAR top-level entries:
  - `assets/<namespace>/textures/gui/**/*.png`
  - `assets/<namespace>/textures/gui/sprites/**/*.png`
  - `assets/<namespace>/atlases/**/*.json`
  - `assets/<namespace>/font/**/*.json`
  - `assets/<namespace>/lang/**/*.json`
- Store neutral metadata:
  - source archive path;
  - workspace-relative archive path;
  - entry relative path;
  - domain;
  - asset kind;
  - size bytes.
- Return compact counts by kind.
- Default MCP inventory output remains counts-only.
- Detailed path lists require explicit list/read requests and existing budgets.

### P1 Allowed
P1 must extend resource parity with datapacks, still without design logic.

- Reuse the same asset-kind classifier for loose resource/datapack assets.
- Discover resource-pack roots and workspace `assets/**` roots.
- Add namespace and kind summaries for general resource assets, not only GUI-oriented assets.
- Add explicit budgeted reads for JSON/text resources such as models, blockstates, particles, shaders, atlas, font, and lang files.
- Add namespace-level counts.
- Add bounded samples per kind, maximum 3-5 paths.
- Allow explicit reads of JSON/text resource files:
  - atlas JSON;
  - font JSON;
  - lang JSON.

### P2 Deferred
P2 requires a separate spec before implementation.

- PNG header width/height extraction.
- Atlas/font JSON structured summaries.
- Heuristic UI role labels such as `button`, `slot`, `screen`, `widget`.
- Resource-pack docs shard expansion in `mdm-sources`.

## Non-Goals
The following are explicitly out of scope for this phase:

- no generic UI design system;
- no texture generation;
- no visual screenshot/image analysis;
- no PNG binary dumping into context;
- no automatic nine-slice inference;
- no resource-pack authoring platform;
- no new public MCP tool for UI design;
- no default prompt injection of long UI/design rules;
- no moving private/generated modpack caches into `mdm-sources`.

These non-goals do not weaken resource support. They only prevent the runtime MCP from becoming a subjective design or authoring system.

## Naming Rules
Use neutral evidence names.

Preferred:

- `assetKind`
- `assetResourceSummary`
- `resourceSummary`
- `countsOnly`

Avoid in runtime payload/API names:

- `uiDesign`
- `uiResourceIndex` as a stable public promise;
- `layoutGuidance`;
- `nineSliceGuidance`;
- `dynamicWindowGuidance`.

If a UI-oriented name is unavoidable, it must be limited to docs/spec wording, not default runtime API.

## Token And Performance Rules
Default behavior:

- counts only;
- cache metadata;
- no path list unless requested;
- no file contents unless requested;
- no binary content;
- no large markdown injection.

Allowed performance tradeoff:

- extra SQLite indexing is acceptable if it prevents repeated JAR scanning;
- optional expensive indexing must be refreshable and fingerprint-invalidated;
- callers may spend extra performance for speed only through explicit cache/index operations.

## Current WIP Decision
The UI/resource-pack WIP explored during this discussion is not to be committed as-is.

Acceptable parts to reintroduce through the plan:

- path classifier for selected GUI/resource asset kinds;
- SQLite entry index schema extension;
- counts-only compact summary;
- tests proving no path dump in default MCP inventory output.

Parts to withhold:

- runtime service-profile guidance mentioning nine-slice/grid/dynamic-window;
- `uiResourceIndex` as a default public payload field name;
- barrel-exporting low-level resource kind helpers without a stable API decision.

## Testable Constraints
Any implementation must include tests for:

- public MCP tool count remains one;
- `@mcpskill/mcp-server` public exports do not expand accidentally;
- `@mcpskill/agent-harness` public exports do not expand accidentally;
- default MCP payload returns compact counts, not full resource path lists;
- explicit resource list/read paths still obey existing budgets;
- `docs_lookup` remains fallback, not primary, for evidence-backed resource requests;
- service-profile guidance stays short and evidence-oriented;
- TS/TSX source and test files stay below 500 lines;
- no Go files or Go module files reappear.

## References
- `docs/superpowers/specs/2026-04-30-resource-evidence-parity-system-spec.md`
- `docs/superpowers/specs/2026-04-30-vanilla-asset-format-coverage-spec.md`
- `docs/reviews/2026-04-29-project-delivery-progress.md`
- `docs/superpowers/specs/2026-04-19-all-typescript-agent-harness-runtime-design.md`
- `docs/superpowers/specs/2026-04-26-agentic-bottom-layer-services-design.md`
- `docs/superpowers/specs/2026-04-29-delivery-closure-and-full-completion-spec.md`
- `docs/reviews/2026-04-30-mod-archive-entry-index-verification.md`
- `docs/reviews/2026-04-30-mod-archive-class-owner-index-verification.md`
- `apps/mcp-server/src/mcp-tools.ts`
- `apps/mcp-server/src/mcp-structured-content.ts`
- `apps/mcp-server/src/mod-archive-inventory.ts`
- `packages/agent-harness/src/index.ts`
- `packages/service-profile/src/guidance.ts`
- `packages/jar-source-adapter/src/mod-archive-entry-index.ts`
