# Project Delivery Progress
Date: 2026-04-30
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`, sibling `mdm-sources`, conceptual `mdm-resources`

## Executive Summary
本地交付闭环切片已经完成。项目现在不再只是 MCP 能力集合，而是有了可验证的资源包源仓库、release artifact、MCP registry reader、runtime cache 状态、checksum 校验，以及 `mc_develop` structuredContent 中的资源状态输出。

当前仍不能视为完整公开交付版，因为远程下载/安装、资源包发布 workflow 的实际发布、资源驱动 docs retrieval、真实整合包大场景验证和 UX 文档还没有完成。但 alpha 本地闭环已经成立，可以回到功能完成阶段。

## Current Repository State
### MCP
- Worktree: `/private/tmp/mc-developing-mcp-skill-update`
- Branch: `skill-update`
- Remote: `origin/skill-update`
- Git state after delivery closure commits: clean before docs update, then docs update pending this commit
- Public MCP surface: one tool, `mc_develop`
- Latest full verification: `pnpm test` passed with 79 test files and 247 tests
- Latest MCP package verification: `pnpm --filter @mcpskill/mcp-server test` passed with 28 test files and 75 tests

Recent MCP delivery-closure commits:

- `0783dfc feat(resource-registry): read local mdm registries`
- `aff046f feat(resource-registry): summarize mdm cache status`
- `7fd6839 feat(mcp-server): inject mdm resource status`

### `mdm-sources`
- Path: `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`
- Branch: `main`
- Remote state: `origin/main [gone]`
- Git state after verification: clean

Committed baseline:

- `8c30ae8 chore: initialize mdm sources baseline`
- `7485169 feat: validate mdm resource packages`
- `2e2b894 feat: add required core docs package`
- `51cf66f feat: build local mdm resource releases`

Do not push `mdm-sources` until the target remote branch is confirmed.

## Delivery Closure Status
Status: complete for the local loop.

Implemented:

- `mdm-sources` baseline, schema, registry, validation, required core docs package, local release builder, and validation workflow.
- Deterministic `.mdm-resource.json` local artifact for `core-docs-required`.
- MCP `@mcpskill/resource-registry` package for local registry reading.
- MCP runtime cache layout and cache state read/write helpers.
- MCP resource status summary with `ready`, `missing_required`, `missing_optional`, and `invalid_checksum`.
- `mc_develop` structured content now includes `mdmResources` when `MDM_SOURCES_ROOT` is configured.
- Public MCP tool count remains one.
- File size guard passes: no source/test JSON/JS/TS file above 500 lines.
- Go residue guard passes: no Go files or Go module files remain.

Not implemented in this slice:

- Remote release download/install.
- GitHub release distribution for resource packages.
- User confirmation flow for large/private/generated local packages.
- Resource-backed docs search replacement.
- Real-world LostCivilization/PrismLauncher full scenario validation.

## Completion Estimate
### MCP Core Capability
Estimated completion: 75-80%.

Completed:

- TypeScript monorepo
- `mc_develop` progressive public tool
- stdio MCP server
- request plan and evidence plan
- harness route and intent logic
- workspace detection
- Gradle source archive lookup
- Gradle dependency binary archive lookup
- JAR source/content lookup
- datapack file lookup
- ProbeJS/KubeJS type lookup and TypeScript language-service integration
- JDTLS runtime, diagnostics registry, lifecycle cleanup, and diagnostic source path bridge
- on-demand vanilla source acquisition
- local source package installation
- SQLite source index build/query/read
- structured content payload budgeting
- MDM local registry/cache/status integration

Still incomplete:

- remote resource package download and checksum install flow
- docs retrieval from external resource package indexes
- full migration analysis across Java/KubeJS/datapack versions
- robust modpack-specific derived caches for ProbeJS snippets/items/registries
- concentrated real-world scenario testing
- final install/usage docs and UX pass

### `mdm-sources` / `mdm-resources`
Estimated completion: 35-40%.

Completed:

- committed baseline
- package schema and registry schema
- local validation tooling
- required core docs package
- deterministic local release artifact builder
- local release artifact metadata written into registry
- CI validation workflow

Still incomplete:

- remote release publication and retention policy
- package compatibility policy
- split package catalog for docs, libraries, content mods, generated indexes, and local/private derived packages
- MCP download/install/clear/list commands or internal flows
- resource package signing or stronger provenance model
- real package payload expansion beyond the first required core docs package

### Overall Deliverability
Estimated alpha deliverability: 65-70%.

Interpretation:

- Local alpha loop is real and verified.
- MCP can explain whether required/optional resource packages are ready or missing.
- The system is not public-deliverable until remote package acquisition and UX docs are finished.

## Recommended Sequence
### Step 1: Feature Completion To Near 100%
Now that delivery closure is complete, return to MCP capability completion.

Priority:

1. Connect docs retrieval to resource packages instead of only built-in records.
2. Add remote/local resource install semantics with confirmation for large/private/generated packages.
3. Improve modpack JAR indexing for class ownership, assets, data, recipes, and datapack content.
4. Improve Gradle workspace model extraction.
5. Expand KubeJS support for d.ts, snippets, items, registries, recipes, and generated ProbeJS variants.
6. Add migration analysis for Java/KubeJS/datapack version moves.
7. Harden JDTLS setup guidance and fallback behavior.

### Step 2: Concentrated Testing And UX
Do this after feature-completion work stabilizes.

Priority:

- Real PrismLauncher LostCivilization validation.
- Real Java mod workspace validation.
- Real KubeJS/ProbeJS validation.
- Real datapack validation.
- Crash triage with external mod JARs.
- Offline mode and cache-miss UX.
- Missing JDTLS/Gradle/ProbeJS setup UX.
- Clean install docs for MCP clients.

## Delivery Timeline Estimate
If work continues at the current pace:

- Local alpha delivery closure: complete.
- Beta replacement for day-to-day MC development: about 2-3 weeks.
- Public-quality delivery with remote resource releases and UX docs: about 4-6 weeks.

The next risk is scope expansion. Keep the next phase feature-focused and continue using review docs with real outputs.

## Verification Reference
Detailed verification output is recorded in:

`docs/reviews/2026-04-30-mdm-delivery-closure-verification.md`
