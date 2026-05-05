# Reference MCP Absorption Roadmap Spec
Date: 2026-05-05
Author: m1hono
Status: Draft implementation roadmap
Scope: `SKillUpdate` / `mc-developing-mcp` internal architecture, source packages, source indexes, docs retrieval, mod archive analysis, migration verification, and harness evidence flow

## Goal
把外部 Minecraft MCP 项目的成熟经验吸收到本项目中，但不改变本项目的核心形态：`mc_develop` 作为单一渐进式入口，底层通过内部 route、package、cache、index、verifier 为 agent 提供证据链。

## Reference Comparison

### Reference A: Documentation / Database MCP Pattern

Strengths to absorb:

- 文档、映射、Javadoc、示例和教程材料被切块、索引、打分，而不是作为整篇 markdown 返回。
- SQLite/FTS 是成熟 retrieval 层，带 schema version、hash、更新/恢复状态。
- 搜索结果带可解释信号，例如匹配了哪些 symbol、path、heading、mapping 或 code block。
- 示例库和可选数据集是 accelerator，不应被当作权威源码。

Weaknesses not to copy:

- 公共工具数量多，agent 容易把注意力花在选择工具而不是证据链上。
- 示例库若直接暴露来源，会污染 harness 和用户输出。
- Markdown-first 的输出容易混淆 skill 和 MCP，且不利于结构化后续调用。

### Reference B: Source Acquisition / Verification MCP Pattern

Strengths to absorb:

- Minecraft source 可以按版本、mapping、remap、decompile job 动态生成，而不是仓库分发。
- Mod JAR 可以先做轻量 inventory、metadata、dependency、mixin、entrypoint、asset/data 分析，再决定是否反编译。
- Line-range source read 是防 token 浪费的关键能力。
- Mixin/access widener validation 是非常适合 agent 的 verifier：不只说失败，还要给出目标不存在的原因和邻近候选。
- Version comparison 应升级到 method、field、registry、asset/data kind 级别，而不是只比较文件。

Weaknesses not to copy:

- 不把 remap/decompile/index 作为公开工具暴露给上层 agent。
- 不在启动时或无确认时下载大包。
- 不要求用户理解底层 job 编排；MCP 应通过 route 决定下一步。

## Design Position

本项目的差异化设计是：公共 API 保持小，内部服务变强。

```text
mc_develop request
  -> harness intent and service profile
  -> evidence plan
  -> internal route:
       workspace.analyze
       source.bundle
       context.query
       docs.lookup
       migration/analyzer/verifier
  -> package/cache/index/verifier backends
  -> compact structured evidence
```

Agent 不应该自己决定是否 decompile、remap、read full file、search docs、scan JAR。它应该提出需求，MCP 根据 workspace、runtime、cache、credentials 和 confirmation 状态返回最小可行动证据。

## Required Capability Families

### 1. Chunked Source And Docs Indexing

Current state:

- `@mcpskill/source-index` has file metadata, Java symbols, and file-level FTS.
- `@mcpskill/docs-retrieval` has structured in-memory docs records and scoring.

Target state:

- Add `source_chunks` and `fts_chunks`.
- Add `docs_chunks` or reusable chunk record shape for docs packages.
- Each hit returns `path`, `startLine`, `endLine`, `chunkType`, `score`, and `matchReasons`.
- File/source content remains authoritative; SQLite is an accelerator.

### 2. FTS Query Pipeline With Match Reasons

Current state:

- Source index wraps text query in a quoted FTS phrase.
- Docs retrieval uses simple normalized substring scoring.

Target state:

- Normalize Minecraft/modding vocabulary and punctuation.
- Try FTS first.
- Fall back to bounded `LIKE` or record search when FTS fails or returns nothing.
- Rank by exact symbol, path, phrase, API surface, version/loader, and file kind.
- Return compact `matchReasons`, not just scores.

### 3. Line-Range Reads Everywhere

Current state:

- `readIndexedSourceFile` supports bounded line reads.
- Some archive and datapack reads are bounded by bytes, not always by semantic follow-up range.

Target state:

- All source package, workspace, Gradle archive, mod archive, generated vanilla, and decompiled source reads should expose a common compact line-range shape.
- Search hits should include enough location data for a follow-up read.
- Full file reads require explicit request and still obey budget.

### 4. Remap / Decompile Job Cache

Current state:

- Vanilla source acquisition and Gradle source archives exist.
- Full remap/decompile job orchestration is not implemented.

Target state:

- A private job/cache backend tracks `hasJar`, `hasMappings`, `hasRemappedJar`, `hasDecompiledSource`, `hasSourceIndex`, and `activeJobStatus`.
- Concurrent requests share locks.
- Remote acquisition is confirmation-gated.
- MCP reports `needs_confirmation`, `installing`, `ready`, or `failed` through existing evidence payloads.
- No public `decompile_*`, `remap_*`, or `index_*` tools.

### 5. Mod Archive Pre-Decompile Analysis

Current state:

- JAR and nested JAR content, metadata, resource inventory, class owner index, and resource references exist.

Target state:

- Add mixin config, access widener, entrypoint, dependency, service provider, and class statistics summaries.
- Use this lightweight evidence to decide whether source decompile is required.
- Keep output counts-first and path-based.

### 6. Mixin / Access Widener Verification

Current state:

- No dedicated verifier.

Target state:

- Given a target class/member, check source index, mappings, class owner index, and local mod archive evidence.
- Return status: `valid`, `missing_target`, `ambiguous_target`, `version_mismatch`, or `source_unavailable`.
- Include nearby candidates and required next read, not long source dumps.

### 7. Version Migration Evidence

Current state:

- Datapack/resource-pack profiles and migration hints exist.
- Java/API version migration is not method-level.

Target state:

- Compare methods, fields, class ownership, events, registry names, data kinds, and resource kinds between versions when corpora/indexes exist.
- If corpora are missing, return package/install requirements rather than guessed advice.

### 8. Harness Integration

Current state:

- Harness already routes KubeJS, client visual, resource pack, crash, and source tasks with progressive public API.

Target state:

- Harness should ask for evidence classes, not tool names.
- For KubeJS, always prefer ProbeJS/d.ts/snippets/items/registries before generic JS assumptions.
- For client visual, always combine source, assets, archive, docs, and API-proof evidence.
- For migration, state required source packages or indexes before advising.

## Non-Goals

- No broad public MCP surface expansion.
- No automatic large downloads without user confirmation.
- No repository-distributed generated vanilla or private modpack cache.
- No hard dependency on semantic/vector retrieval before FTS/chunk search is complete.
- No external project names in harness prompt text, standards output, or user-facing evidence.

## Delivery Order

1. Source/docs chunk index and match reasons.
2. Common line-range read shape across source backends.
3. Mod archive pre-decompile analysis summaries.
4. Remap/decompile job cache contract.
5. Mixin/access widener verifier.
6. Method/member/version migration evidence.
7. Harness policy refinements that consume the new evidence.

## Acceptance Criteria

- `mc_develop` public surface remains progressive and minimal.
- Every new evidence payload is compact and structured.
- Every package/cache feature has explicit required/optional/private/local-derived classification.
- Tests demonstrate red/green behavior against real local fixtures, not only mock payloads.
- TS/TSX files stay under 500 lines.
