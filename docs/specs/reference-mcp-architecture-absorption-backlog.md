# Reference MCP Architecture Absorption Backlog

Date: 2026-05-05

## Boundary

This backlog absorbs useful architecture patterns from external Minecraft MCP projects without changing this project's public MCP surface. `mc_develop` remains the single progressive public tool. New capability should be implemented behind existing internal routes such as `source.bundle`, `context.query`, `workspace.analyze`, source packages, source indexes, and runtime caches.

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
- Vanilla source/resource acquisition is on-demand and confirmation-gated.
- Source bundle and context query already support Gradle archives, mod archives,
  nested jars, resource traces, and compact line/path evidence.
- Client visual evidence now combines source scan, API proof, assets, resource
  references, shader reference gating, and resource-pack profiles.

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
- Workspace, vanilla, and mod archive source paths use the same compact read shape.

## Backlog E: Client Visual Source Scanner

Goal: promote `clientVisualEvidence` from asset-only to source-and-asset evidence.

Initial scanner signals:

- Registry declarations for blocks/items/block entities.
- Client init registrations.
- Renderer binding calls.
- Menu/screen registrations.
- Model layer or baked model registrations.
- Asset resource locations referenced from Java or KubeJS.

Acceptance criteria:

- `clientVisualEvidence.sourceEvidence` reports non-zero counts when source patterns are found.
- Source evidence links to bounded file/line snippets, not full files.
- Asset evidence remains counts-first and does not dump binary content.

## Reference MCP Absorption Status

Scope: track this absorption round's implemented and remaining architecture
work without expanding the public MCP tool surface.

Public surface constraint:

- Do not add new public tools for reference MCP features.
- Keep `mc_develop` as the single progressive public entry point.
- Route new evidence through internal capabilities such as `source.bundle`,
  `context.query`, workspace analysis, package/cache state, and structured
  evidence payloads.
- Future work should prefer an internal evidence route over public
  `decompile_*`, `index_*`, `search_*`, or dataset-specific tools.

Completed or verified in this absorption round:

- Source-index chunks: source indexing now has chunk-aware search, including
  bounded snippets, path/line metadata, chunk id, and
  `matchReasons`.
- Source-index fallback: the search pipeline uses FTS-first lookup with bounded
  fallback behavior when FTS syntax fails or returns no useful result.
- Docs `matchReasons`: documentation retrieval results expose compact reasons
  that explain why a result was selected, including search term, script scope,
  addon, event, code symbol, heading, and title reasons.
- Mod archive pre-decompile analysis: mod archives should be inspected before
  full decompilation for mixin configs, access wideners, service providers,
  class files, assets, and datapack content.
- Source acquisition job state: source package acquisition should report
  explicit job/cache state such as jar, mappings, remapped jar, decompiled
  source, source index, and job status.
- Mixin target verifier skeleton: an internal pure helper verifies requested
  mixin targets against class evidence and reports nearby candidates.

Pending verification or follow-up:

- Mixin target verifier skeleton is implemented and verified as an internal
  pure helper. It is not wired into public MCP tools or package public exports.
- Verified chunk search fallback behavior with source-index tests; raw FTS
  syntax failures fall back to bounded LIKE results.
- Verified docs retrieval `matchReasons` as structured search hit data.
- Verified mod archive pre-decompile analysis as a central-directory-only
  summary before any decompile step.
- Verified source acquisition job state as a pure state contract. Real
  persistence, lock sharing, and mc_develop evidence routing remain follow-up
  implementation work.
- Verification results are recorded in
  `docs/reviews/2026-05-05-reference-mcp-absorption-verification.md`.

## Non-Goals

- No public tool expansion.
- No implicit large remote downloads.
- No external project names in user-facing standards or harness prompts.
- No regex-only Java result should be treated as semantic proof when LSP or compiled source evidence is available.
