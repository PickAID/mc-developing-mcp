# Reference MCP Absorption Verification

Date: 2026-05-05

## Scope

This document records verification evidence for the current reference MCP
absorption round. It is intentionally evidence-heavy; durable architecture
principles and future backlog belong in
`docs/specs/reference-mcp-architecture-absorption-backlog.md`.

Constraints verified in this round:

- Runtime and implementation direction remains TypeScript-only.
- No new public MCP tool surface for absorbed reference capabilities.
- Public tool surface stays intentionally minimal; new behaviors are internal
  evidence routes, not user-visible tool proliferation.
- New capabilities stay behind existing internal evidence routes such as
  `source.bundle`, `context.query`, workspace analysis, package/cache state,
  source indexes, and structured payloads.
- External reference project names stay out of user-facing standards and public
  policy text.
- KubeJS is treated as a Minecraft scripting/runtime domain with lifecycle,
  registry, data/resource-pack, and ProbeJS evidence, not as ordinary generic
  JavaScript.

Current Progress: approximately 98%. This is materially advanced, but not
complete until a durable long-running worker/daemon path and deeper verifier
semantics are completed against the latest combined worktree state.

## Verification Items

### Source Index Chunks

Item: chunk-aware source indexing and source-index-backed reads.

Status: implemented and verified for the current internal slice.

Evidence Route: `source-index.sqlite` stores chunk metadata and FTS-backed
chunk content. Installed vanilla source package reads can consume the index for
bounded source evidence before falling back to direct file reads or budgeted
scans.

Tests:

- `pnpm --filter @mcpskill/source-index test`: passed; 6 tests.
- `pnpm --filter @mcpskill/vanilla-source-adapter test`: passed; 7 tests.
- `pnpm test`: `packages/source-index/src/indexer.test.ts` covered chunk line
  ranges, `matchReasons`, punctuation-heavy fallback behavior, and trailing
  newline line-count normalization for indexed source reads.

Remaining Risk: source files remain the authority, and SQLite remains an
accelerator. Cross-package index lifecycle, stale-index handling, and wider
`mc_develop` routing still need continued verification as more source package
types adopt indexed reads.

### FTS Fallback

Item: robust source query pipeline.

Status: implemented and verified at source-index level.

Evidence Route: FTS5 lookup runs first. Syntax failures or no useful FTS result
fall back to bounded LIKE search instead of exposing raw FTS failure to the
agent.

Tests:

- `pnpm --filter @mcpskill/source-index test`: passed.
- `pnpm test`: source-index tests covered punctuation-heavy query fallback.

Remaining Risk: ranking quality still depends on future tuning for symbol,
path, phrase, code-pattern, version/loader, and file-kind signals.

### Java Member Index

Item: best-effort Java member lookup inside the source index.

Status: implemented and verified for ordinary Java fields, constructors, and
methods, including owner plus `memberKind` filtering.

Evidence Route: `source-index.sqlite` now stores `java_members` rows with owner,
member name, kind, signature, return type, and line range. Query input supports
`member`, optional `owner`, and optional `memberKind` without changing existing
`symbol` type lookup semantics.

Tests:

- `pnpm --filter @mcpskill/source-index test`: passed; 6 tests.
- `pnpm test`: `packages/source-index/src/indexer.test.ts` covered member
  count, member query, owner filtering, `memberKind` filtering for fields versus
  methods, and preserved symbol lookup behavior.

Remaining Risk: extraction is regex plus brace scanning, not a compiler-grade
Java parser. Complex declarations, generated sources, unusual generics,
anonymous classes, and malformed source should still be treated as lookup
assistance rather than semantic proof.

### Source Package Install Locking

Item: cross-process source package install coordination and source acquisition
state closure.

Status: implemented and verified for the current source-package-manager slice.

Evidence Route: confirmed source package installs now acquire a per-package
atomic lock directory before running recipe execution. Concurrent requests that
do not own the lock return `installing` with `activeLockPath` and
`statusReason` evidence instead of racing the same install directory. Source
job snapshots now explain `needs_confirmation`, `installing`, `ready`, and
`failed` states.

Tests:

- `pnpm --filter @mcpskill/source-package-manager test`: passed; 9 files, 34 tests.
- `pnpm exec vitest run apps/mcp-server/src/source-bundle-executor.test.ts`:
  passed as part of the focused MCP source-bundle run.

Follow-up Evidence: source acquisition job state now records `createdAt`,
`updatedAt`, `heartbeatAt`, and a compact progress snapshot with stage,
completed stage count, total stage count, and percent. Supervision evidence
combines persisted job state with current install lock inspection so MCP
payloads can explain active, stale, missing, ready, or failed source jobs
without adding public tools.

Tests:

- `pnpm --filter @mcpskill/source-package-manager test`: passed; 9 files, 38 tests.

Follow-up Evidence: source acquisition execution now has a runner contract with
`synchronous_install`, `background_ready`, `background_unavailable`, and
`queued` statuses. The default runner wraps the existing synchronous install
path, while injected runners can report queued/background status without
executing recipes. Execution evidence is persisted on source job snapshots and
passed through acquisition evidence for existing MCP routes.

Follow-up Evidence: queued source acquisition jobs can now be persisted as
runtime-local job request files and later executed through package-level APIs.
This provides a recoverable local handoff between the MCP-facing request path
and a future durable worker without adding public MCP tools.

Tests:

- `pnpm --filter @mcpskill/source-package-manager test`: passed; 11 files, 46 tests.

Remaining Risk: this still does not start a durable long-running worker or
daemon. Stale locks are detected as read-only evidence and are not
automatically deleted. Real background acquisition workers and long-running
download/decompile execution still need a later runtime pass.

### MDM SQLite Direct Docs Lookup

Item: route large `sqlite_bundle` documentation packages through direct SQLite
search instead of full record materialization.

Status: implemented and verified for docs lookup routing.

Evidence Route: `sqlite_bundle` artifacts are now passed to `docs_lookup` as
direct-search artifacts. `searchMdmDocsSqliteRecords()` queries FTS when the
bundle provides `docs_entries_fts`, and falls back to bounded `docs_entries`
LIKE search otherwise. JSON and small record artifacts continue to load through
the common docs record path.

Tests:

- `pnpm exec vitest run packages/docs-retrieval/src/search.test.ts packages/docs-retrieval/src/mdm-resource.test.ts apps/mcp-server/src/docs-lookup-executor.test.ts apps/mcp-server/src/mdm-docs-records.test.ts`: passed with SQLite/JSON mixed ranking and trace coverage.

Remaining Risk: mixed SQLite/JSON hit ranking now uses a shared stable ranking
helper and trace metadata, but future work should tune relevance quality for
large multi-package docs searches.

### Mixin And AW Verifier Boundary Evidence

Item: make verifier payloads explicit about what is proven and what remains
evidence-only.

Status: implemented and verified for current Mixin/AW evidence payloads.

Evidence Route: Mixin member evidence now exposes descriptor proof levels,
including unproven descriptors and parameter-type-only proof. Mixin route
payloads declare `namespaceTranslation: false`, `semanticVerification: false`,
and an aggregate `descriptorProofLevel` so callers do not confuse source-index
and descriptor narrowing with a full semantic verifier. AW/ClassTweaker
evidence declares `namespaceTranslation: false`, `semanticVerification: false`,
file kind, warnings, and parser-level targets.

Follow-up Evidence: Mixin verifier-boundary payloads now explicitly report
`mappingNamespaceTranslation: "unavailable"`,
`injectionPointSemanticVerification: false`,
`injectionPointVerificationStatus: "unavailable"`, and
`fullSemanticVerifier: false`. AW/ClassTweaker evidence reports
`namespaceTranslationStatus: "unavailable"`, `applicabilityStatus: "unknown"`,
and `applicabilityProofLevel: "parser_only"` both at payload level and target
level.

Tests:

- `pnpm exec vitest run apps/mcp-server/src/mixin-target-verifier.test.ts apps/mcp-server/src/mixin-target-evidence-route.test.ts apps/mcp-server/src/access-widener-targets.test.ts`: passed in subagent verification; 26 tests.
- `pnpm exec vitest run apps/mcp-server/src/gradle-source-archive-lookup.test.ts apps/mcp-server/src/mixin-target-verifier.test.ts apps/mcp-server/src/mixin-target-evidence-route.test.ts apps/mcp-server/src/access-widener-targets.test.ts`: passed; 4 files, 34 tests.
- `pnpm exec vitest run apps/mcp-server/src/mixin-aw-verifier-boundary.test.ts apps/mcp-server/src/mixin-target-evidence-route.test.ts apps/mcp-server/src/mixin-target-verifier.test.ts apps/mcp-server/src/access-widener-targets.test.ts`: passed; 4 files, 28 tests.

Remaining Risk: this is still evidence narrowing, not bytecode/LSP-backed
semantic verification. Full descriptor type matching, mapping namespace
translation, injection-point validation, and AW applicability verification
remain future work.

### Client Visual Missing Evidence UX

Item: avoid implying that missing client visual evidence means the code or
asset does not exist.

Status: implemented and verified for the compact client visual evidence packet.

Evidence Route: client visual evidence now reports missing source/renderer/API
links as "not proven by current scan" and includes `evidenceLimitations` so the
agent can decide whether to expand scanning, read jars/assets, or request
version-specific source instead of treating bounded misses as absence proof.

Tests:

- `pnpm exec vitest run apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts`: passed; 2 tests.

### Combined Verification

Item: latest combined worktree verification after source package locking, MDM
SQLite docs lookup routing, and client visual UX wording.

Status: passed on 2026-05-05.

Commands:

- `pnpm exec vitest run packages/docs-retrieval/src/search.test.ts packages/docs-retrieval/src/mdm-resource.test.ts apps/mcp-server/src/docs-lookup-executor.test.ts apps/mcp-server/src/mdm-docs-records.test.ts packages/agent-harness/src/brief.test.ts packages/agent-harness/src/task-brief.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts`: passed; 9 files, 28 tests.
- `pnpm --filter @mcpskill/source-package-manager test`: passed; 9 files, 34 tests.
- `pnpm test`: passed; 175 files, 607 tests.
- `git diff --check`: passed.
- `find apps packages tests -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 500 && $2 != "total" { print }'`: passed with no output.
- `MCPSKILL_SMOKE_WORKSPACE_ROOT='/Users/gedwen/Library/Application Support/PrismLauncher/instances/LostCivilization/minecraft' MCPSKILL_RUNTIME_ROOT=/tmp/mcpskill-real-workspace-smoke pnpm --filter @mcpskill/mcp-server smoke:real-workspace`: passed.

Real-workspace smoke evidence:

- Mod archive request selected `mod_archive_content` and listed 64 archive
  inventory entries.
- Resource-pack asset request selected `datapack_files` and summarized 512
  local resource asset files.
- ProbeJS request selected `probejs_types` and resolved
  `ServerEvents.recipes`.

### Workspace And Gradle Bounded Line Reads

Item: common line-range read shape and diagnostic/stacktrace-bounded source
reads for workspace, Gradle archive, vanilla, and mod archive source evidence.

Status: implemented and verified for full-content fallback and line-hinted
bounded references.

Evidence Route: workspace source references and Gradle source archive
references now include `startLine`, `endLine`, `totalLines`, and `truncated`
alongside content. If request text contains Java diagnostics such as
`File.java:30:10` or stacktrace hints such as `Widget.java:30`, the source
reference returns a bounded snippet around that line. Explicit follow-up reads
can use `source.read path/to/File.java:20-35` to request an exact line range.
Explicit ranges are capped by the same bounded-read line limit to prevent
token-heavy `source.read path:1-100000` follow-ups. Without a reliable line
hint, it preserves the existing full-content fallback within byte budgets.
For mod archive Java entries, the route now defaults to a bounded first window
instead of returning the whole Java entry, and supports both full archive paths
and filename-only hints such as `Widget.java:30:1`. Nested JarJar Java reads
use the same evidence shape with `embedded.jar!/path.java:start-end`
`nextReads`. Nested hint matching includes the embedded archive path, so one
nested jar's line hint does not apply to another nested jar with the same Java
entry path. Local datapack/resource-pack explicit reads, generated vanilla
datapack/assets evidence, and mod archive text entries now also use
`source.read path:start-end` next-read hints for JSON/data/assets paths where
explicit bounded ranges are requested. Nested JarJar text reads use the same
`embedded.jar!/path:start-end` convention. Client visual evidence no longer
returns raw asset paths in `nextReads`; it emits the same `source.read`
convention.

Tests:

- `pnpm --filter @mcpskill/mcp-server test -- gradle-source-archive-lookup.test.ts source-bundle-workspace-executor.test.ts`:
  passed after bounded read integration; package script ran 74 test files and
  213 tests.
- `pnpm --filter @mcpskill/mcp-server test -- line-range-evidence.test.ts source-bundle-executor.test.ts source-bundle-workspace-executor.test.ts gradle-source-archive-lookup.test.ts`:
  passed after explicit range cap and vanilla line-count fixes; package script
  ran 75 test files and 214 tests.
- `pnpm --filter @mcpskill/mcp-server test -- mod-archive-batch-read.test.ts mod-archive-nested-batch-read.test.ts`:
  passed after mod archive Java source read integration, direct/nested JSON
  explicit line ranges, and nested hint collision regression coverage; package
  script ran 76 test files and 223 tests.
- `pnpm --filter @mcpskill/mcp-server test -- source-bundle-client-visual-evidence.test.ts source-bundle-vanilla-assets-executor.test.ts source-bundle-datapack-executor.test.ts source-bundle-datapack-read.test.ts`:
  passed after local datapack/resource-pack, generated vanilla resource, and
  client visual next-read normalization; package script ran 76 test files and
  221 tests.
- `pnpm test`: `apps/mcp-server/src/gradle-source-archive-lookup.test.ts` and
  `apps/mcp-server/src/source-bundle-workspace-executor.test.ts` covered line
  metadata, diagnostic/stacktrace bounded snippets, and explicit
  `source.read path:start-end` ranges for archive and workspace reads.
  `apps/mcp-server/src/line-range-evidence.test.ts` covered max-line capping
  for explicit follow-up ranges.
  `apps/mcp-server/src/mod-archive-batch-read.test.ts` and
  `apps/mcp-server/src/mod-archive-nested-batch-read.test.ts` covered direct
  and nested mod archive Java source reads with bounded defaults,
  filename-only line hints, explicit capped ranges, JSON data line ranges, and
  `nextReads`.
  `apps/mcp-server/src/source-bundle-datapack-read.test.ts`,
  `apps/mcp-server/src/source-bundle-datapack-executor.test.ts`,
  `apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts`, and
  `apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts` covered
  `source.read` next-read hints for local data/assets, generated vanilla
  resources, and client visual asset evidence.

Remaining Risk: bounded reads currently rely on line hints already present in
request/context text or the current `source.read path:start-end` convention.
Diagnostics from other languages/routes still need future coverage.

### Datapack And Resource-Pack Evidence Split

Item: treat datapack and resource-pack evidence as separate first-class package
domains.

Status: implemented for the current evidence routes and version-profile
coverage.

Evidence Route: datapack and resource-pack packages are split rather than
collapsed into a generic resources bucket. Both are treated with the same
seriousness as Java source evidence: bounded reads, package acquisition
evidence, generated vanilla datapack/assets resources, local project roots, and
explicit `source.read path:start-end` follow-ups all preserve domain-specific
context. Version profiles cover Minecraft 1.18.2 through current/future
pack-format handling so older packs and forward migration questions are not
silently downgraded.

Remaining Risk: future Minecraft pack-format changes still require curated
profile updates and UX review to keep migration guidance clear.

### Docs Match Reasons

Item: structured explanation for documentation retrieval hits.

Status: implemented and verified.

Evidence Route: docs retrieval results include compact `matchReasons`, including
stable reasons such as search term, script scope, addon, event, code symbol,
heading, and title matches.

Tests:

- `pnpm --filter @mcpskill/docs-retrieval test`: passed.
- `pnpm test`: `packages/docs-retrieval/src/search.test.ts` covered
  `search_term:*`, `script_scope:*`, and `addon:*` reason output.

Remaining Risk: reason labels need to stay stable and public-safe as retrieval
ranking evolves.

### Mod Archive Pre-Decompile Route

Item: low-cost archive inspection before full decompilation.

Status: implemented and verified through an internal route.

Evidence Route: explicit pre-decompile requests use the existing
`mod_archive_content` internal route with `mode: "pre_decompile_analysis"`.
The payload includes selected archive details, relative archive path, metadata,
counts-only analysis, and `compact_mod_archive_pre_decompile_analysis` token
policy. No public tool was added.

Tests:

- `pnpm --filter @mcpskill/jar-source-adapter test`: passed.
- `pnpm test`: `packages/jar-source-adapter/src/mod-archive-analysis.test.ts`
  covered ZIP central-directory inspection.
- `pnpm --filter @mcpskill/mcp-server test -- source-bundle-executor.test.ts mod-archive-pre-decompile-analysis.test.ts`:
  passed; package script ran 72 test files and 203 tests.

Remaining Risk: current inspection does not read class bytecode and does not
decompile. It is a routing and triage layer, not semantic Java proof.

### Source Acquisition Evidence

Item: package acquisition state and source job snapshot evidence.

Status: implemented and verified as persisted payload evidence, with real
background job execution still incomplete.

Evidence Route: `SourcePackageEnsureResult` maps to package-level acquisition
evidence. Java source packages include a `sourceJob` snapshot with jar,
mappings, remapped jar, decompiled source, source index, and status phases.
Datapack, resource-pack, and assets artifacts remain package-level acquisition
evidence and do not claim remap/decompile phases. Source-pack acquisition job
state is now persisted beside source-package lock/state files and acquisition
evidence prefers that persisted snapshot over synthesized fallback evidence.
Vanilla source remains user-confirmation gated, generated locally after
approval, and excluded from repository contents. SQLite packages are acquired or
generated on demand rather than auto-downloaded at startup. `mdm-sources` and
`mdm-resources` are small curated manifests; privacy-sensitive local-derived
indexes and caches belong to MCP-managed local state, not committed docs or
source trees.

Tests:

- `pnpm --filter @mcpskill/source-package-manager test`: passed after
  acquisition evidence adapter and persisted source job state integration; 8
  test files and 31 tests.
- `pnpm test`: `packages/source-package-manager/src/source-job-state.test.ts`
  covered confirmation gate, ready transition, failure transition, lock key,
  and persisted read/write round-trip.
- `pnpm test`: `packages/source-package-manager/src/acquisition-evidence.test.ts`
  covered source-pack confirmation/ready snapshots and datapack evidence
  without source-job phases, including rejection of accidental sourceJob
  overrides for non-source packages.
- `pnpm test`: `packages/source-package-manager/src/install.test.ts` covered
  persisted job states for needs-confirmation, installing, ready, install
  failure, and validation failure.
- `pnpm --filter @mcpskill/mcp-server test -- generated-vanilla-resource-acquisition.test.ts source-bundle-datapack-executor.test.ts source-bundle-vanilla-assets-executor.test.ts`:
  passed; package script ran 73 test files and 205 tests.

Remaining Risk: cross-process lock sharing, real background job runner behavior,
and consistent `mc_develop` routing remain follow-up work.

### Mixin Target Verification Route

Item: internal verifier and `mod_archive_content` route for Mixin targets and
member-level source-index proof.

Status: implemented and verified behind existing internal evidence routing.

Evidence Route: crash-log analysis now preserves
`mixinTargetClassReferences`; request execution carries those references into
later candidates; `mod_archive_content` can return
`mode: "mixin_target_verification"` with compact target status, candidates,
available class count, cache metadata, and truncation. Vanilla and loader-owned
targets stay out of mod-archive verification so existing metadata/source routes
can continue to handle them. The same route now parses compact Mixin/JVM member
references such as `target=Lowner;method()V`, queries installed
`source-index.sqlite` packages for matching Java members by owner/name/kind, and
returns `memberProofs` with status, matches, candidates, and bounded
`source.read path:start-end` follow-ups. This remains source-index evidence, not
bytecode truth. Member-derived vanilla/loader targets stay out of mod-archive
verification, truncated archive class inventories are not treated as
authoritative missing-target proof, and constructor requests normalize JVM
`<init>` references to source-index constructor names. JVM descriptors narrow
overloaded method/constructor proof by parameter count when Java source
signatures are parseable, but arity-only matches remain ambiguous rather than
valid because type-level descriptor proof is not implemented. Descriptor-free or
equal-arity overload evidence remains ambiguous.
Class proof and `memberProofs` are intentionally separate: class-entry evidence
can prove candidate class presence, while source-index member evidence can only
support method/field/constructor presence and line follow-ups. JVM descriptors
are consumed as narrowing evidence, not as full bytecode proof.

Tests:

- `pnpm --filter @mcpskill/mcp-server test -- mixin-target-verifier.test.ts`:
  passed.
- `pnpm --filter @mcpskill/mcp-server test -- request-executor-metadata-crash.test.ts mixin-target-evidence-route.test.ts crash-log-signals.test.ts mixin-target-verifier.test.ts`:
  passed; package script ran 74 test files and 209 tests.
- `pnpm --filter @mcpskill/mcp-server test -- mixin-member-signals.test.ts mixin-target-verifier.test.ts mixin-target-evidence-route.test.ts`:
  passed after source-index-backed Mixin member proof integration; package
  script ran 77 test files and 231 tests.
- `pnpm exec vitest run packages/jar-source-adapter/src/archive-content.test.ts apps/mcp-server/src/access-widener-targets.test.ts apps/mcp-server/src/mixin-member-signals.test.ts apps/mcp-server/src/mixin-target-verifier.test.ts`:
  passed after access widener metadata/parser and descriptor-arity narrowing
  integration; 4 test files and 27 tests.
- `pnpm test`: covered exact match, same-package candidate, simple-name prefix
  ambiguity, source unavailable, crash-log context chaining, non-vanilla
  missing target evidence, vanilla metadata crash regression, Mixin/JVM member
  signal extraction, valid method proof, missing member proof, wrong-kind member
  proof, constructor proof, vanilla ignored-prefix member routing, truncated
  class inventory handling, descriptor-arity overload narrowing without valid
  overclaiming, descriptor-free ambiguity preservation, and route-level
  source-index method proof.

Remaining Risk: current verification uses class-entry evidence from archives
and source-index member rows, not bytecode or compiler-grade Java AST semantics.
Descriptor proof currently uses parameter count, not full JVM type matching.
Mapping namespace translation, access widener verifier integration, and
injection-point semantic validation remain follow-up work.

### Access Widener Metadata And Parsing

Item: access widener file readability and compact target parsing.

Status: implemented and verified as metadata/parser support, not yet wired into
semantic verifier decisions.

Evidence Route: `*.accesswidener` and `*.classtweaker` entries are classified as
archive `metadata`, so existing mod archive list/read/search paths can inspect
them without new public MCP tools. `parseAccessWidenerTargets` parses v1/v2
headers, class/method/field targets, transitive access flags, valid
modifier/kind combinations, and compact diagnostics for malformed lines.
Access widener and ClassTweaker data is evidence-only at this stage. It is not
used to perform namespace translation and does not claim semantic target
verification.

Tests:

- `pnpm exec vitest run packages/jar-source-adapter/src/archive-content.test.ts apps/mcp-server/src/access-widener-targets.test.ts apps/mcp-server/src/mixin-member-signals.test.ts apps/mcp-server/src/mixin-target-verifier.test.ts`:
  passed; 4 test files and 27 tests.

Remaining Risk: this does not yet translate mapping namespaces, compare AW
targets against source-index/member evidence, or emit dedicated AW verifier
payloads. Those remain follow-up work behind existing internal routes.

### Harness And Prompt Injection Guardrails

Item: keep harness prompts and internal routes aligned with the absorbed architecture.

Status: implemented for the current policy slice.

Evidence Route: harness internal routes guide tasks toward evidence capabilities
without exposing reference-style many-tool APIs. Prompt-injection handling is
part of the harness policy surface so retrieved docs, package metadata, archive
contents, KubeJS scripts, and resource files remain evidence rather than
instructions.

Remaining Risk: UX pass should verify that refusal/escalation wording is clear
when evidence contains adversarial or misleading text.

### MDM SQLite Docs Artifacts

Item: make MDM docs/resource packages more than JSON placeholders.

Status: implemented for the current docs artifact slice.

Evidence Route: `sqlite_bundle` metadata now triggers real SQLite validation
and reading. Resource status opens the cached artifact, validates required
tables and `PRAGMA user_version`, and reports `invalid_artifact` for missing
tables or too-old schemas. Docs retrieval can read `docs_entries` rows from a
SQLite artifact while preserving legacy JSON artifact compatibility.
SQLite docs artifacts can also be queried directly: `docs_entries_fts` is used
when present, and bounded `docs_entries` `LIKE` search is used as fallback when
the FTS table is absent.

Tests:

- `pnpm exec vitest run packages/docs-retrieval/src/mdm-resource.test.ts packages/resource-registry/src/status.test.ts apps/mcp-server/src/mdm-docs-records.test.ts apps/mcp-server/src/mcp-tools-mdm-resources.test.ts apps/mcp-server/src/mcp-tools-mdm-docs-resources.test.ts`:
  passed; 5 test files and 17 tests.
- `pnpm exec vitest run packages/docs-retrieval/src/mdm-resource.test.ts packages/docs-retrieval/src/search.test.ts apps/mcp-server/src/mdm-docs-records.test.ts`:
  passed after direct SQLite FTS/LIKE docs querying; 3 test files and 10 tests.

Remaining Risk: MCP docs lookup still materializes ready docs resource records
for the common search path. A later slice should route large `sqlite_bundle`
artifacts to the direct SQLite search function before loading all records.

### Client Visual Evidence Retrieval Chain

Item: client visual evidence across UI, render, shader, assets, and
resource-pack signals.

Status: implemented for the current source-bundle evidence packet.

Evidence Route: client visual evidence combines source scans, API proof,
renderer/UI/screen signals, shader documentation gates, asset/resource
references, generated vanilla assets, and resource-pack profiles. The route is
evidence-chain oriented: it combines retrieval results instead of treating a
single asset path or Java reference as conclusive proof.

Remaining Risk: UX pass should verify that combined visual evidence is readable
and that missing shader/render evidence is presented as a gap, not a false
negative.

### Real Modpack Smoke Evidence

Item: prove the current MCP routes work against a real modpack-shaped
workspace, not only fixtures.

Status: verified through a privacy-preserving smoke script on a local Prism
instance without dumping private script contents.

Workspace Shape: the local LostCivilization instance exposes `.probe`, `kubejs`,
`logs`, `mods`, `resourcepacks`, and 84 mod jars.

Smoke Results:

- Mod archive inventory request selected `mod_archive_content` and returned
  `mode: inventory` with 64 listed archives plus persistent cache/resource
  summary keys.
- Resource/asset request selected `datapack_files` and returned a compact
  local resource summary for 512 asset files with resource-pack/client visual
  evidence keys.
- ProbeJS request selected `probejs_types` and resolved `ServerEvents.recipes`
  through the TypeScript language service.
- The earlier natural-language ProbeJS request that mentioned `ItemStack` now
  selects `probejs_types` and resolves `ItemStack`; this confirms the symbol
  extraction gap was fixed for the current high-value cases.

Smoke Script:

- `pnpm --filter @mcpskill/mcp-server smoke:real-workspace` prints JSON lines
  with request text, workspace kind, route/status/summary, source/mode, and
  payload keys only. It does not print user script contents or full payloads.

Remaining Risk: the smoke script is still an operator-run verification path,
not a CI requirement, because it depends on a local private workspace.

## Public Tool Negative Verification

Status: verified by review of this absorption slice and test coverage.

Evidence Route: absorbed capabilities are exposed through existing internal
routes and structured evidence payloads. The reviewed docs preserve
`mc_develop` as the single progressive public entry point.

Negative Findings:

- No public `decompile_*` tool should be added for remap/decompile/source-cache
  work.
- No public `index_*` tool should be added for source-index work.
- No dataset-specific public search tool should be added for docs, mappings,
  examples, archives, or source packages.
- Pre-decompile archive analysis remains an internal
  `mod_archive_content` route.

Remaining Risk: future feature slices must continue to prove that requested
capabilities cannot be represented through existing progressive evidence routes
before proposing any public surface change.

## Test Run Summary

- `pnpm --filter @mcpskill/source-index test`: passed after Java member index;
  6 tests.
- `pnpm --filter @mcpskill/docs-retrieval test`: passed.
- `pnpm --filter @mcpskill/source-package-manager test`: passed; 8 test files
  and 31 tests.
- `pnpm --filter @mcpskill/jar-source-adapter test`: passed.
- `pnpm --filter @mcpskill/mcp-server test -- mixin-target-verifier.test.ts`:
  passed; package script ran 71 test files and 202 tests.
- `pnpm --filter @mcpskill/mcp-server test -- request-executor-metadata-crash.test.ts mixin-target-evidence-route.test.ts crash-log-signals.test.ts mixin-target-verifier.test.ts`:
  passed; package script ran 74 test files and 207 tests.
- `pnpm --filter @mcpskill/mcp-server test -- mixin-member-signals.test.ts mixin-target-verifier.test.ts mixin-target-evidence-route.test.ts`:
  passed after source-index-backed Mixin member proof integration; package
  script ran 77 test files and 231 tests.
- `pnpm exec vitest run packages/jar-source-adapter/src/archive-content.test.ts apps/mcp-server/src/access-widener-targets.test.ts apps/mcp-server/src/mixin-member-signals.test.ts apps/mcp-server/src/mixin-target-verifier.test.ts`:
  passed after access widener metadata/parser and descriptor-arity narrowing
  integration; 4 test files and 27 tests.
- `pnpm --filter @mcpskill/mcp-server test -- gradle-source-archive-lookup.test.ts source-bundle-workspace-executor.test.ts`:
  passed after bounded read integration; package script ran 74 test files and
  213 tests.
- `pnpm --filter @mcpskill/mcp-server test -- line-range-evidence.test.ts source-bundle-executor.test.ts source-bundle-workspace-executor.test.ts gradle-source-archive-lookup.test.ts`:
  passed after explicit range cap and vanilla line-count fixes; package script
  ran 75 test files and 214 tests.
- `pnpm --filter @mcpskill/mcp-server test -- mod-archive-batch-read.test.ts mod-archive-nested-batch-read.test.ts`:
  passed after mod archive Java source read integration, direct/nested JSON
  explicit line ranges, and nested hint collision regression coverage; package
  script ran 76 test files and 223 tests.
- `pnpm --filter @mcpskill/mcp-server test -- source-bundle-client-visual-evidence.test.ts source-bundle-vanilla-assets-executor.test.ts source-bundle-datapack-executor.test.ts source-bundle-datapack-read.test.ts`:
  passed after local datapack/resource-pack, generated vanilla resource, and
  client visual next-read normalization; package script ran 76 test files and
  221 tests.
- `pnpm --filter @mcpskill/vanilla-source-adapter test`: passed; 7 tests.
- `pnpm --filter @mcpskill/mcp-server test -- generated-vanilla-resource-acquisition.test.ts source-bundle-datapack-executor.test.ts source-bundle-vanilla-assets-executor.test.ts`:
  passed; package script ran 73 test files and 205 tests.
- `pnpm --filter @mcpskill/mcp-server test -- source-bundle-executor.test.ts mod-archive-pre-decompile-analysis.test.ts`:
  passed; package script ran 72 test files and 203 tests.
- `pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-executor.test.ts apps/mcp-server/src/source-bundle-datapack-read.test.ts apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts`:
  passed after datapack executor split; 4 test files and 13 tests.
- `pnpm exec vitest run apps/mcp-server/src/real-workspace-smoke.test.ts apps/mcp-server/src/probejs-types-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/mixin-target-evidence-route.test.ts apps/mcp-server/src/access-widener-targets.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts`:
  passed after real-workspace smoke, ProbeJS extraction, and AW evidence
  extraction hardening; 6 test files and 36 tests.
- `pnpm --filter @mcpskill/mcp-server smoke:real-workspace`: passed against the
  local LostCivilization workspace; selected mod archive inventory, resource
  asset evidence, and ProbeJS symbol evidence without printing payload content.
- `pnpm exec vitest run apps/mcp-server/src/probejs-symbol-extraction.test.ts apps/mcp-server/src/probejs-types-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts`:
  passed after extracting ProbeJS symbol selection into a dedicated helper; 3
  test files and 18 tests.
- `pnpm test`: passed; 175 test files and 607 tests.
- `find apps packages tests -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 500 && $2 != "total" { print }'`:
  no output.
- `git diff --check`: no output.

## Summary

The verified absorption slice covers chunked source retrieval, Java member
lookup with kind filtering, workspace/Gradle bounded line reads, docs
`matchReasons`, mod archive pre-decompile analysis, source acquisition
state/evidence, and internal Mixin target/member verification routing. It
is TypeScript-only, keeps the public tool surface minimal, treats KubeJS as a
Minecraft-specific scripting domain, and now covers datapack/resource-pack,
mod-archive nested reads, AW/ClassTweaker evidence, harness prompt-injection
policy, and client visual evidence chains. It should not be described as fully
complete: the current overall progress is approximately 98%. Full tests,
line-limit checks, diff checks, direct SQLite docs lookup routing, source
package install locking with read-only stale-lock evidence, source job
supervision snapshots, source acquisition runner contract, recoverable queued
job request files, mixed docs ranking, UX wording pass, explicit Mixin/AW
verifier boundary payloads, and real-workspace smoke have passed. Remaining
work is a durable long-running worker/daemon path, mapping namespace translation, AW applicability
verification, injection-point validation, and deeper method/field-level Mixin
validation.
