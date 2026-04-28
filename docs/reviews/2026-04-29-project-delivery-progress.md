# Project Delivery Progress
Date: 2026-04-29
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`, sibling `mdm-sources`, conceptual `mdm-resources`

## Executive Summary
当前项目已经不是空壳。MCP 底层能力完成度较高，尤其是 Java/KubeJS/Gradle/JAR/Datapack/source package/JDTLS 这些关键底层已经有测试和真实输出 review。

但项目还没有进入可交付状态，因为 `mdm-sources/mdm-resources` 的资源包发布、下载、校验、缓存和用户可理解的状态闭环还没打通。下一步应先做交付闭环切片，然后再继续开发剩余功能到接近 100%，最后集中做真实环境测试与 UX 收敛。

## Current Repository State
### MCP
- Worktree: `/private/tmp/mc-developing-mcp-skill-update`
- Branch: `skill-update`
- Remote: `origin/skill-update`
- Git state when this progress was written: clean
- Public MCP surface: one tool, `mc_develop`
- Latest known full verification: `pnpm test` passed with 74 test files and 236 tests

### `mdm-sources`
- Path: `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`
- Git state when inspected: no initial commit yet
- Existing files:
  - `index.json`
  - `modules/core-docs/module.json`
  - `modules/docs-search/module.json`
  - `modules/jar-content-index/module.json`

## Completion Estimate
### MCP Core Capability
Estimated completion: 65-70%.

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

Not complete:

- `mdm-resources` registry/cache status integration
- remote resource package download and checksum verification
- docs retrieval from external package indexes
- full migration analysis across Java/KubeJS/datapack versions
- robust modpack-specific derived caches for ProbeJS snippets/items/registries
- concentrated real-world scenario testing
- final install/usage docs and UX pass

### `mdm-sources` / `mdm-resources`
Estimated completion: 10-15%.

Completed:

- Skeleton repository exists.
- Legacy module manifest concept exists.
- Earlier design/spec exists in MCP docs.

Not complete:

- initial commit
- package schema
- generated registry
- validation tooling
- release artifact tooling
- release workflow
- real package payloads
- MCP registry client
- MCP cache status
- MCP checksum/install loop

### Overall Deliverability
Estimated alpha deliverability: 50-55%.

Interpretation:

- The MCP has enough internal capability to become useful soon.
- The project is not yet deliverable because package/resource distribution is not real.
- A focused delivery closure slice should raise alpha deliverability significantly without requiring every feature to be complete.

## Recommended Sequence
### Step 1: Delivery Closure Slice
Plan: `docs/superpowers/plans/2026-04-29-mdm-delivery-closure-implementation.md`

Goal:

- Commit `mdm-sources` baseline.
- Add package schema and validation.
- Add one required core package.
- Build local release artifacts.
- Add MCP resource registry reader.
- Add MCP cache/status summary.
- Surface resource status through existing `mc_develop` structured content.

Expected result:

- Alpha-ready delivery loop.
- MCP can explain resource availability.
- `mdm-sources` stops being a loose skeleton and becomes a real package source repo.

### Step 2: Continue Feature Completion To Near 100%
Do this only after Step 1.

Priority:

1. Connect docs retrieval to resource packages instead of only built-in records.
2. Improve modpack JAR indexing for class ownership, assets, data, recipes, and datapack content.
3. Improve Gradle workspace model extraction.
4. Expand KubeJS support for d.ts, snippets, items, registries, recipes, and generated ProbeJS variants.
5. Add migration analysis for Java/KubeJS/datapack version moves.
6. Harden JDTLS setup guidance and fallback behavior.

### Step 3: Concentrated Testing And UX
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

- Alpha delivery closure: about 1 week.
- Beta replacement for day-to-day MC development: about 2-3 weeks.
- Public-quality delivery with resource release workflow and UX docs: about 4-6 weeks.

These estimates assume the next slice stays focused. If feature expansion continues before the resource delivery loop is closed, the timeline becomes less predictable.

## Immediate Decision
Proceed with:

`docs/superpowers/plans/2026-04-29-mdm-delivery-closure-implementation.md`

After it completes, update this progress document and then resume feature development toward full capability before the final UX/testing phase.
