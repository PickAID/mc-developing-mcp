# Delivery Closure And Full Completion Spec
Date: 2026-04-29
Author: m1hono
Status: Delivery closure local loop implemented; Phase 2 feature completion remains
Scope: `mc-developing-mcp` `skill-update` branch, sibling `mdm-sources` repository, local `mdm-resources` runtime cache

## Purpose
The project has enough bottom-layer capability to stop treating it as a prototype, but it is not yet a deliverable product. The next work should create a delivery loop before adding more features:

1. Make `mdm-sources` a real source repository for resource package metadata and release artifacts.
2. Teach the MCP to consume those artifacts through a minimal, verified resource client.
3. Return to feature completion after the package/release/cache loop is real.
4. Run concentrated real-environment testing and UX cleanup only after the major capability surface is stable.

This spec defines the sequencing so future work does not become another long chain of unrelated feature patches.

## Naming
`mdm-sources` is the public or shareable repository that stores package manifests, small package payloads, release metadata, and release workflows.

`mdm-resources` is the conceptual release artifact and local cache layer consumed by MCP. It may appear as release asset names, runtime cache directories, and package metadata, but private/generated user caches must not be committed to `mdm-sources`.

## Current State
### MCP Server
Current branch:

- Repository worktree: `/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate`
- Branch: `skill-update`
- Remote branch: `origin/skill-update`
- Public MCP surface: one progressive tool, `mc_develop`
- Current full verification: `pnpm test` passes with 84 test files and 262 tests

Implemented core capabilities:

- TypeScript monorepo foundation
- Runtime layout and local source package installation
- Workspace detection and harness routing
- Stdio MCP server
- Structured content budget bounds
- Gradle source and dependency archive lookup
- JAR source/content lookup
- Datapack file lookup
- ProbeJS and KubeJS TypeScript language-service support
- JDTLS runtime, diagnostics bridge, lifecycle cleanup, and diagnostic-source path bridge
- On-demand vanilla source package installation through local recipes
- SQLite source index build/query/read primitives
- MDM release manifest read/install/cache flow with explicit download confirmation
- MDM docs resource loading and compact diagnostics in `mc_develop` structured content

### `mdm-sources`
Current repository:

- Path: `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`
- Branch: `main`
- Remote state: `origin/main`
- Git state: committed baseline plus release artifact publication metadata
- Files: package schemas, registry metadata, validation tooling, local release tooling, and the first required core docs resource package

Current gaps:

- GitHub Release workflow automation and retention policy are not finished
- MCP install UX is still minimal and request-driven
- Resource-backed docs retrieval is connected for cached docs artifacts, but the package catalog is still minimal
- Package catalog only contains the first required core docs package

## Deliverability Levels
### Alpha Deliverable
Target: usable by the owner in local development with documented caveats.

Required:

- MCP installs and starts through documented stdio command.
- `mdm-sources` has a committed baseline.
- One real resource package can be built, checksummed, published locally, and consumed by MCP.
- MCP can run without remote resources and can explain which optional resource packages are missing.
- Current full test suite remains green.

Estimated state after this spec's first plan: alpha-ready.

### Beta Replacement For MC-Skill
Target: reasonable default for day-to-day Java/KubeJS/datapack modding assistance.

Required:

- Real Prism/modpack scenario validation.
- Java diagnostics, Gradle/JAR source lookup, KubeJS ProbeJS lookup, datapack lookup, and vanilla source lookup all verified with real output markdown.
- `mdm-resources` cache has install/list/status/clear semantics.
- Package failures produce concise guidance instead of internal stack traces.
- Old MC-Skill remains untouched while `skill-update` becomes the replacement branch.

### Full Public Delivery
Target: shareable repository and release process.

Required:

- CI for MCP and `mdm-sources`.
- Release workflow for MCP package and resource packages.
- Resource package compatibility policy.
- Semver and schema version strategy.
- Installation docs for Codex, Claude Desktop, and generic MCP clients.
- Focused UX pass after feature completion.

## Important Slice: Delivery Closure
The immediate slice must not attempt to finish every feature. It must prove the product can ship resources safely.

### Goals
- Create the committed `mdm-sources` baseline.
- Define package manifests and release asset metadata.
- Add local validation and local release build tooling.
- Add MCP-side resource registry client and cache status surface.
- Verify a full local loop: package source -> registry -> artifact -> MCP cache -> `mc_develop` evidence path.

### Non-Goals
- Do not import large generated caches into `mdm-sources`.
- Do not publish private workspace artifacts.
- Do not expose many new MCP tools.
- Do not rewrite current MCP routing.
- Do not make `mdm-sources` depend on the MCP repo.

## Architecture
### Resource Source Layer
`mdm-sources` owns:

- `packages/**/package.json`
- small checked-in payloads when legal and useful
- `registry/index.json`
- `registry/packages/*.json`
- release workflows
- release artifact generation scripts

### MCP Resource Layer
MCP owns:

- resource registry fetch/read logic
- local cache layout
- checksum validation
- install state
- derived indexes
- private/generated package metadata
- user confirmation policy for large or privacy-sensitive resources

### Runtime Consumption
The MCP request pipeline should treat resource packages as optional accelerators unless a route explicitly requires a package.

Required package categories:

- Core routing and required schema docs
- Runtime policy metadata needed to explain resource state

Optional package categories:

- Docs search indexes
- JAR content indexes
- Mod library source indexes
- Generated ProbeJS snippets/items/resources
- Large vanilla or mod source packages

## Sequencing
### Phase 1: Delivery Closure
Deliver a working package/release/cache loop.

Status: complete for the local filesystem loop.

Exit criteria:

- `mdm-sources` has an initial commit and validation tests.
- MCP can consume a local `mdm-sources` registry path.
- MCP reports resource package status in structured content without expanding the public tool surface.
- A review markdown records real command outputs.

### Phase 2: Feature Completion To Near 100%
Return to MCP capability completion.

Focus areas:

- Resource client integration into docs retrieval.
- Better modpack archive indexing and assets/data extraction.
- Gradle workspace model improvements.
- More robust KubeJS d.ts/snippet/item/resource querying.
- JDTLS setup guidance and fallback behavior.
- Datapack versioned support and generated content detection.
- Migration analysis for Java/KubeJS/datapack version moves.

Exit criteria:

- Each route has at least one real-environment smoke case.
- All critical package/resource flows have unit and integration tests.
- No source or test file above 500 lines.

### Phase 3: Concentrated Testing And UX
Run only after Phase 2 stabilizes.

Focus areas:

- Real PrismLauncher modpack validation.
- Crash triage scenarios.
- Missing dependency scenarios.
- Offline mode and cache-hit/cache-miss UX.
- MCP client setup docs.
- Error copy and structured content trimming.

Exit criteria:

- A release candidate checklist passes.
- UX review docs list no blocker-level confusion.
- Install instructions can be followed from a clean checkout.

## Acceptance Checklist
- [x] `mdm-sources` has a committed baseline with package schema and registry.
- [x] `mdm-sources` validation can run locally without external services.
- [x] Local release artifact generation produces checksummed artifacts.
- [x] MCP can read a local registry path and validate at least one cached artifact state.
- [x] MCP can run with resources absent and explain degraded capability.
- [x] MCP public surface remains one tool, `mc_develop`.
- [x] Required vs optional packages are explicit in metadata and user-facing output.
- [x] Private/generated user caches remain outside `mdm-sources`.
- [x] Full MCP test suite passes.
- [x] Real output review markdown exists for the delivery loop.

## Risks
- `mdm-sources` may become confused with a Skill if markdown docs are treated as first-class runtime content. Mitigation: use structured package manifests and generated indexes; markdown can be source material only when explicitly packaged.
- Release artifacts may grow too large. Mitigation: large generated or private packages stay local; release packages are split and optional.
- MCP UX can degrade if every missing optional package is noisy. Mitigation: resource status should be summarized by capability, not dumped as package internals.
- Node SQLite availability depends on runtime Node version. Mitigation: keep SQLite use inside source-index package and document Node requirements or fallback constraints.

## Recommended Next Step
Execute `docs/superpowers/plans/2026-04-29-mdm-delivery-closure-implementation.md`.

After that slice is complete, update `docs/reviews/2026-04-29-project-delivery-progress.md` and then resume feature-completion work before starting the concentrated UX/testing phase.
