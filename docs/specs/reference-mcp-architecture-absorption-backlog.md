# Reference MCP Architecture Absorption Backlog

Date: 2026-05-05

## Boundary

This backlog absorbs useful architecture patterns from external Minecraft MCP projects without changing this project's public MCP surface. `mc_develop` remains the single progressive public tool. New capability should be implemented behind existing internal routes such as `source.bundle`, `context.query`, `workspace.analyze`, source packages, source indexes, and runtime caches.

## Lessons To Absorb

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

## Non-Goals

- No public tool expansion.
- No implicit large remote downloads.
- No external project names in user-facing standards or harness prompts.
- No regex-only Java result should be treated as semantic proof when LSP or compiled source evidence is available.
