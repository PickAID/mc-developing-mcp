# Reference MCP Absorption Verification

Date: 2026-05-05

## Scope

本文件记录本轮 reference MCP absorption 的完成/待完成状态与验证结果。

限制：

- 不新增 public MCP tool。
- 后续能力应通过 `mc_develop` 下的 internal evidence route 暴露，例如
  `source.bundle`、`context.query`、workspace analysis、source package/cache
  state，或其他结构化 evidence payload。

## Absorbed Items

### Source Index Chunks And Fallback

记录状态：

- 已实现 chunk-aware source index：chunk metadata、bounded snippets、
  path/line range、chunk id、`matchReasons`。
- 已实现 FTS-first 查询策略。
- 已实现 fallback 约束：FTS 语法失败或无结果时走 bounded fallback，不应让
  raw FTS failure 泄漏给 agent。

验证：

- `pnpm --filter @mcpskill/source-index test` 通过。
- `pnpm test` 中 `packages/source-index/src/indexer.test.ts` 4 个测试通过。
- 覆盖 chunk line range、match reasons、punctuation-heavy query fallback。
- Follow-up 接入验证：vanilla source resolver 已消费已安装 package 的
  `source-index.sqlite`，并把 bounded `startLine`、`endLine`、`totalLines`、
  `chunkId`、`matchReasons` 传入 `source.bundle` / `mc_develop` evidence
  payload。

### Docs MatchReasons

记录状态：

- 已实现 docs retrieval 结果 `matchReasons`。
- `matchReasons` 应解释命中原因，例如 symbol、path、phrase、code pattern、
  version/loader、file kind。
- `matchReasons` 应进入结构化 payload，而不是只停留在内部排序逻辑。

验证：

- `pnpm --filter @mcpskill/docs-retrieval test` 通过。
- `pnpm test` 中 `packages/docs-retrieval/src/search.test.ts` 2 个测试通过。
- 覆盖 `search_term:*`、`script_scope:*`、`addon:*` 等稳定 match reason。

### Mod Archive Pre-Decompile Analysis

记录状态：

- 已实现 mod archive pre-decompile analysis。
- 当前实现统计 mixin configs、access wideners、service providers、class files、
  asset files、data files。
- 该能力用于在完整 decompile 前提供低成本证据，并帮助决定是否需要后续
  acquisition/decompile job。

验证：

- `pnpm --filter @mcpskill/jar-source-adapter test` 通过。
- `pnpm test` 中 `packages/jar-source-adapter/src/mod-archive-analysis.test.ts`
  1 个测试通过。
- 当前实现使用 ZIP central directory，不读取 class bytecode，不做 decompile。
- Follow-up 接入验证：`mod_archive_content` internal route 现在支持显式
  pre-decompile analysis request，返回 `mode: "pre_decompile_analysis"`、
  selected archive、relative archive path、metadata、counts-only analysis 和
  `compact_mod_archive_pre_decompile_analysis` token policy；未新增 public tool。

### Source Acquisition Job State

记录状态：

- 已实现 source acquisition/cache state shape：
  `hasJar`、`hasMappings`、`hasRemappedJar`、`hasDecompiledSource`、
  `hasSourceIndex`、`status`。
- 状态应通过现有 internal evidence responses 表达，例如
  `needs_confirmation`、`installing`、`ready`、`failed`。
- 当前切片只实现 pure state contract 和 lock key，不声称已经完成真实并发
  lock 或持久 job runner。
- Follow-up 接入验证：`SourcePackageEnsureResult` 现在会映射成 package-level
  `acquisition` evidence。Java source-pack 会附带 `sourceJob` snapshot；
  datapack/resource-pack/assets 只返回 package-level acquisition，不附带 remap/
  decompile job phases。

验证：

- `pnpm --filter @mcpskill/source-package-manager test` 通过。
- `pnpm test` 中 `packages/source-package-manager/src/source-job-state.test.ts`
  3 个测试通过。
- 覆盖 confirmation gate、ready transition、failure transition、lock key。
- `packages/source-package-manager/src/acquisition-evidence.test.ts` 覆盖
  source-pack confirmation/ready snapshot，以及 datapack 不附带 source job。

### Mixin Target Verifier Skeleton

记录状态：

- 已实现 mixin/access-widener target verifier skeleton。
- 当前 skeleton 用 requested target 与 available class evidence 判断 exact match、
  missing、ambiguous、source unavailable。
- 该 helper 未接入 public MCP tool，也未从 package public entrypoint 导出。

验证：

- `pnpm --filter @mcpskill/mcp-server test -- mixin-target-verifier.test.ts` 通过。
- `pnpm test` 中 `apps/mcp-server/src/mixin-target-verifier.test.ts` 4 个测试通过。
- 覆盖 exact match、same-package candidate、simple-name prefix ambiguity、
  source unavailable。

## Public Tool Policy

结论：

- 不新增 `decompile_*`、`index_*`、dataset-specific search 等 public tools。
- 不把 reference MCP 的多工具表面复制进本项目。
- 所有新增能力优先作为 `mc_develop` internal evidence route 的后台能力。
- 若未来发现确需暴露能力，必须先证明无法通过现有 progressive evidence
  route 表达，并单独走架构评审。

## Test Results

- `pnpm --filter @mcpskill/source-index test`: passed.
- `pnpm --filter @mcpskill/docs-retrieval test`: passed.
- `pnpm --filter @mcpskill/source-package-manager test`: passed after
  acquisition evidence adapter; 8 test files and 27 tests.
- `pnpm --filter @mcpskill/jar-source-adapter test`: passed.
- `pnpm --filter @mcpskill/mcp-server test -- mixin-target-verifier.test.ts`:
  passed; package script ran 71 test files and 202 tests.
- `pnpm --filter @mcpskill/vanilla-source-adapter test`: passed; 7 tests.
- `pnpm --filter @mcpskill/mcp-server test -- generated-vanilla-resource-acquisition.test.ts source-bundle-datapack-executor.test.ts source-bundle-vanilla-assets-executor.test.ts`:
  passed; package script ran 73 test files and 205 tests.
- `pnpm --filter @mcpskill/mcp-server test -- source-bundle-executor.test.ts mod-archive-pre-decompile-analysis.test.ts`:
  passed; package script ran 72 test files and 203 tests.
- `pnpm test`: passed; 163 test files and 525 tests.
- `find apps packages tests -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 500 && $2 != "total" { print }'`: no output.
- `git diff --check`: no output.

## Verification Summary

本轮 absorption slice 已完成可验证底层切片：chunked source retrieval、
docs match reasons、mod archive pre-decompile analysis、source acquisition job
state/evidence、mixin target verifier skeleton。当前仍是内部能力；后续接入必须
继续通过 `mc_develop` progressive evidence route，而不是扩张 public MCP tool
surface。
