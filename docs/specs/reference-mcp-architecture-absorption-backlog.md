# Reference MCP Architecture Absorption Backlog

Date: 2026-05-05

## Boundary

This backlog absorbs useful architecture patterns from external Minecraft MCP projects without changing this project's public MCP surface. `mc_develop` remains the single progressive public tool. New capability should be implemented behind existing internal routes such as `source.bundle`, `context.query`, `workspace.analyze`, source packages, source indexes, and runtime caches. The implementation direction is TypeScript-only, and the public tool surface should stay minimal unless an existing progressive evidence route is demonstrably insufficient.

## Lessons To Absorb

### Reference Project Split

Two external MCP projects were used as architecture references, but this project
should absorb their system lessons rather than copy their public surfaces.

Reference A is strongest as a documentation, mappings, examples, and database
management pattern:

- Documentation is chunked and indexed, not returned as whole markdown files.
- Mapping/Javadoc lookup is treated as a first-class source of API proof.
- Example databases are optional accelerators and should be labeled as such.
- Database packages need install/update/restore status, hashes, and versions.
- Search quality depends on FTS, semantic ranking, code-block context, and
  visible match reasons.

Reference B is strongest as a source acquisition and validation pipeline:

- Minecraft source can be generated on demand from version, mapping, remap, and
  decompile jobs instead of being distributed in the repository.
- Decompiled source and mod source should be persistently cached and searchable.
- Line-range source reads are essential to keep token usage bounded.
- Mod JAR analysis should be possible before full decompilation: metadata,
  dependencies, mixins, entrypoints, class statistics, and resource inventory.
- Mixin/access-widener validation demonstrates the right class of “agentic
  verifier”: use source/mapping evidence to tell the agent exactly why a target
  is wrong and what nearby candidates exist.
- Version comparison should eventually move past file-level diffs toward method,
  field, registry, and package-scoped breaking-change evidence.

Absorbed into current implementation:

- Single progressive public tool policy is retained; reference-style many-tool
  surfaces are folded behind `mc_develop` internal routes.
- Package management now distinguishes required offline docs, optional
  accelerators, local-derived packages, and user-private caches.
- Vanilla source/resource acquisition is on-demand and confirmation-gated;
  generated vanilla source is local-derived evidence and must not be committed
  to the repository.
- `mdm-sources` and `mdm-resources` stay as small curated manifests. Privacy
  and local-derived caches belong to MCP-managed local state.
- SQLite packages are downloaded or generated on demand rather than
  auto-installed at startup.
- Source bundle and context query already support Gradle archives, mod archives,
  nested jars, resource traces, and compact line/path evidence.
- Datapack and resource-pack packages are split and treated with equal rigor,
  including version-profile coverage from Minecraft 1.18.2 through current and
  future pack-format handling.
- Client visual evidence now combines source scan, API proof, assets, resource
  references, shader reference gating, UI/render signals, and resource-pack
  profiles through a combined retrieval chain.
- Harness internal routes and prompt-injection policy treat retrieved docs, source,
  archives, KubeJS scripts, and resources as evidence, not instructions.
- KubeJS is modeled as Minecraft lifecycle/data/resource-pack scripting
  evidence, not as ordinary generic JavaScript.

Not adopted:

- No startup auto-download of large databases.
- No public `decompile_*`, `index_*`, or one-tool-per-dataset API.
- No examples database that leaks external project identities into harness text.
- No semantic/vector retrieval as a hard dependency before FTS and chunk search
  are mature.

### Offline Documentation And Search Packages

Useful patterns:

- SQLite packages should have explicit metadata, content hashes, schema versions, and compact status records.
- Search should operate on chunks, not only full files or whole documents.
- FTS should be the first mature retrieval layer; semantic/vector retrieval is optional and should come later.
- Search results should explain `matchReasons` so the agent knows why a result was selected.
- Optional datasets should be installed explicitly and reported as accelerators, not as authoritative truth.

Avoid:

- Do not register one public MCP tool per dataset or search mode.
- Do not auto-download large packages from install or server startup.
- Do not return markdown-only evidence when structured payloads are possible.

## Backlog A: Source Index Schema V2

Goal: add chunk-aware source indexing while preserving existing file and symbol APIs.

Candidate schema:

- `meta(schema_version, package_id, minecraft_version, loader, mapping, content_hash)`
- `source_files(path, language, size_bytes, sha256, indexed_at)`
- `source_chunks(path, chunk_id, chunk_type, start_line, end_line, symbol, content, token_count, has_code)`
- `fts_chunks` over chunk content, path, and symbol.
- Optional `java_members(path, owner_qualified_name, member_name, member_kind, line, signature, context)`.

Acceptance criteria:

- Existing source index tests keep passing.
- Chunk search returns bounded snippets with `path`, `startLine`, `endLine`, `score`, and `matchReasons`.
- Java member indexing supports `member`, owner, and `memberKind` filters for
  method/field/constructor lookup without changing existing type-symbol
  semantics.
- SQLite remains an accelerator; source files remain the authority.
- No new public MCP tool.

## Backlog B: FTS Query Pipeline

Goal: improve retrieval quality for local source/docs/mod cache searches.

Rules:

- Tokenize query and normalize Minecraft/modding vocabulary.
- Use FTS5 first.
- Fall back to bounded `LIKE` search when FTS syntax fails or returns no result.
- Rank by exact symbol, path, phrase, code pattern, version/loader match, and file kind.
- Return compact `matchReasons`.

Acceptance criteria:

- Queries with punctuation or generic natural language do not fail hard.
- Results are bounded by count and snippet size.
- `mc_develop` structured content stays compact.

## Backlog C: Remap/Decompile Source Cache

Goal: support generated vanilla and mod source as an internal source package backend.

Internal job stages:

- Download confirmed Minecraft or mod artifact.
- Download or resolve mappings.
- Remap jar when required.
- Decompile jar.
- Build source index.
- Write source package manifest.

Cache state:

- `hasJar`
- `hasMappings`
- `hasRemappedJar`
- `hasDecompiledSource`
- `hasSourceIndex`
- `activeJobStatus`

Acceptance criteria:

- Repeated requests reuse cached artifacts.
- Concurrent requests for the same artifact share a lock/job.
- Remote acquisition follows existing confirmation policy.
- The MCP response reports `needs_confirmation`, `installing`, `ready`, or `failed` through existing evidence payloads.
- No `decompile_*`, `remap_*`, or `index_*` public tools.

## Backlog D: Line-Range Source Reads

Goal: prevent token waste from full-source dumps.

Behavior:

- Prefer indexed line ranges for vanilla/generated/decompiled sources.
- Read around diagnostics with a small line radius.
- Full file reads require explicit request and remain size-budgeted.

Acceptance criteria:

- Payload includes `startLine`, `endLine`, `totalLines`, `content`, and `truncated`.
- Search results can be followed by exact bounded reads.
- Workspace, vanilla, Gradle archive, direct mod archive, and nested JarJar
  source paths use the same compact `source.read path:start-end` shape and
  line-capped `nextReads`.
- Datapack/resource-pack JSON, metadata, and text entries use the same bounded
  follow-up convention where text line ranges are available.

## Backlog E: Client Visual Source Scanner

Goal: promote `clientVisualEvidence` from asset-only to combined UI, render,
shader, asset, source, and resource-pack evidence.

Initial scanner signals:

- Registry declarations for blocks/items/block entities.
- Client init registrations.
- Renderer binding calls.
- Menu/screen registrations.
- Model layer or baked model registrations.
- Asset resource locations referenced from Java or KubeJS.
- Shader references and shader documentation/package gates.
- Resource-pack profile and generated vanilla asset evidence.

Acceptance criteria:

- `clientVisualEvidence.sourceEvidence` reports non-zero counts when source patterns are found.
- Source evidence links to bounded file/line snippets, not full files.
- Asset evidence remains counts-first and does not dump binary content.
- Evidence packets compose retrieval-chain proof across UI/render/shader/assets
  and resource-pack signals, and clearly label gaps.

## Backlog F: Mixin And Access Widener Verification

Goal: deepen verifier evidence while keeping it behind existing internal
routes.

Current evidence shape:

- Mixin target verification uses class-entry proof for candidate classes.
- `memberProofs` use source-index member rows for method/field/constructor
  evidence.
- JVM descriptors narrow overload candidates where parseable, but arity-only
  matches remain ambiguous.
- Access widener and ClassTweaker files are readable/searchable metadata and
  parser evidence by default. AW/ClassTweaker method and field targets can be
  raised to `target_presence` when source-index member evidence matches the
  same owner/member/kind, but this is still not access-transformer semantic
  verification.

Acceptance criteria:

- Class proof and member proof remain distinct in payloads.
- AW/ClassTweaker evidence does not perform namespace translation until a
  verified translation layer exists.
- Full JVM descriptor type matching is required before descriptor proof can be
  treated as semantic method/constructor proof.
- No new public verifier tool is added.

## Backlog G: Harness And KubeJS Domain Policy

Goal: keep agent-facing prompts and internal routes aligned with Minecraft evidence
semantics.

Rules:

- Harness policy treats retrieved content as evidence, not instructions, to
  mitigate prompt injection from docs, source, archives, scripts, and resources.
- KubeJS is not ordinary JavaScript: route it through lifecycle, registry,
  datapack/resource-pack, ProbeJS, and Minecraft version evidence.
- Public prompt text must not leak external reference project identities.

Acceptance criteria:

- Harness internal routes can surface prompt-injection guidance without adding
  public MCP tools.
- KubeJS task handling preserves script-scope and Minecraft runtime context.
- UX pass verifies wording for adversarial evidence and missing-evidence cases.

## Reference MCP Absorption Status

Scope: keep the durable architecture state here. Detailed command output and
per-test evidence live in
`docs/reviews/2026-05-05-reference-mcp-absorption-verification.md`.

Public surface constraint:

- Keep `mc_develop` as the single progressive public entry point.
- Do not add public `decompile_*`, `index_*`, `search_*`, or dataset-specific
  tools for reference MCP features.
- Route new evidence through internal capabilities such as `source.bundle`,
  `context.query`, workspace analysis, package/cache state, source indexes, and
  structured evidence payloads.
- Keep external reference project names out of user-facing standards, harness
  prompts, and public policy text.
- Keep implementation and runtime expansion TypeScript-only.

Absorbed internal capabilities:

- Chunk-aware source indexing, including `source-index.sqlite`,
  `source_chunks`, bounded snippets, path/line metadata, chunk ids, and compact
  `matchReasons`.
- Best-effort Java member indexing through `java_members`, preserving existing
  type `symbol` lookup while adding member/owner lookup for ordinary fields,
  constructors, and methods. Member queries can filter by `memberKind` for
  method/field/constructor proof.
- FTS-first source lookup with bounded fallback behavior when FTS syntax fails
  or returns no useful result.
- Installed vanilla source package reads through `source-index.sqlite` before
  falling back to direct file reads or budgeted scans.
- Workspace and Gradle source references now include the common source evidence
  shape: `startLine`, `endLine`, `totalLines`, `content`, and `truncated`,
  with bounded snippets around Java diagnostic and stacktrace line hints plus
  explicit `source.read path:start-end` follow-up ranges.
- Local datapack/resource-pack reads, generated vanilla resources, mod archive
  Java reads, mod archive explicit text-entry reads, and client visual asset
  evidence now use the same `source.read path:start-end` follow-up convention
  for text evidence where a bounded line range is available. Mod archive text
  entries include JSON, `.mcmeta`, `.txt`, `.toml`, and `.lang` paths, including
  nested JarJar `embedded.jar!/path:start-end` reads.
- Documentation retrieval `matchReasons` as structured result data rather than
  hidden ranking-only metadata.
- Mod archive pre-decompile analysis through the existing `mod_archive_content`
  internal route, returning compact metadata/counts before any full decompile.
- Source acquisition evidence that reports package-level acquisition state and,
  for Java source packages, a persisted source job snapshot with jar/mapping/
  remap/decompile/index phases.
- Source acquisition execution now has a runner contract with
  `synchronous_install`, `background_ready`, `background_unavailable`, and
  `queued` statuses. This preserves the current synchronous path while giving
  future background workers a stable evidence contract.
- Queued source acquisition jobs can be persisted as runtime-local job request
  files and executed through package-level APIs. This is a local handoff
  contract, not a public MCP tool or long-running daemon.
- Internal Mixin target verification route through `mod_archive_content` for
  non-vanilla mod archive targets, with compact status, nearby candidates,
  class counts, cache metadata, truncation, and source-index-backed
  `memberProofs` for compact Mixin/JVM method or field references. The route
  keeps vanilla/loader-owned member targets out of mod-archive proof and avoids
  claiming missing targets when class inventory evidence is truncated. JVM
  descriptors can narrow overload candidates by parameter count when
  source-index signatures are parseable, but arity-only matches are not treated
  as valid descriptor proof.
- Access widener metadata/parsing support: `*.accesswidener` and
  `*.classtweaker` archive entries are readable/searchable as metadata, and a
  compact parser extracts v1/v2 headers plus class/method/field targets with
  modifier/kind validation and diagnostics.
- Mixin/AW verifier-boundary payloads now carry explicit unavailable/unknown
  contract fields for mapping namespace translation, injection-point semantic
  verification, and AW applicability proof level; they remain evidence-only with
  no full semantic verifier claim. AW method/field targets may report
  `applicabilityProofLevel=target_presence` only when matched against
  source-index member rows.
- Datapack and resource-pack package split, with both domains treated as
  first-class evidence and version-profile coverage from Minecraft 1.18.2
  through future pack-format handling.
- Vanilla source generation is user-confirmation gated and remains out of the
  repository; generated source and private indexes are MCP-managed local state.
- `mdm-sources` and `mdm-resources` are curated manifests, while SQLite
  packages are downloaded or generated on demand.
- Harness internal routes and prompt-injection policy are part of the architecture:
  retrieved content remains evidence, not instructions.
- KubeJS handling remains Minecraft-specific and should not be downgraded to
  ordinary JavaScript lint/search behavior.
- Client visual evidence covers UI/render/shader/assets/resource-pack signals
  by composing retrieval-chain evidence.

Current progress:

- Overall architecture absorption is approximately 98%.
- The latest combined worktree passed full tests, line limits, diff check, and
  real-workspace smoke. The latest UX wording pass, read-only stale-lock
  evidence, source job supervision snapshot, source acquisition runner
  contract, recoverable queued job request files, mixed docs ranking/trace
  slice, and explicit Mixin/AW verifier-boundary payloads are complete.
  Remaining closure is the backlog items below.

Remaining architecture backlog:

- Extend the current source package install lock, supervision snapshot, and
  queued job request contract from read-only/contract-level evidence into
  explicit recovery policy, real background acquisition workers, and
  long-running download/decompile job execution.
- Continue routing source acquisition job state consistently through
  `mc_develop` evidence, with stronger end-to-end examples for
  `needs_confirmation`, `installing`, `ready`, and `failed`.
- Further tune relevance quality for direct SQLite docs hits plus JSON docs
  hits in the common docs lookup result.
- Deepen Mixin/access-widener verification from source-index-backed member
  presence, descriptor proof-level reporting, explicit boundary contracts, and
  parser evidence toward verified mapping namespace translation, access widener
  applicability verification, and injection-point semantic validation.
- Continue generalizing `source.read path:start-end` into remaining text
  evidence routes, especially vanilla source fallback reads and routes that
  still return whole text payloads without bounded follow-up evidence.
- Expand version comparison from file-level/source-search evidence toward
  method, field, registry, and package-scoped breaking-change evidence.
- Keep semantic/vector retrieval optional until FTS and chunk search quality are
  mature.
- Complete background runtime hardening and deeper verifier semantics before
  marking the absorption round complete.

## Non-Goals

- No public tool expansion.
- No implicit large remote downloads.
- No external project names in user-facing standards or harness prompts.
- No regex-only Java result should be treated as semantic proof when LSP or compiled source evidence is available.
- No AW/ClassTweaker namespace translation should be implied before explicit
  verifier support exists.
