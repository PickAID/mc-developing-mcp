# On-Demand Vanilla Source Acquisition Implementation Plan
Date: 2026-04-24
Author: m1hono
Status: Drafted after Go cleanup
Goal: 在全 TypeScript `SKillUpdate` 中实现 vanilla source 的按需获取、用户确认、本地安装和 `source.bundle` 集成
Architecture: 保持 MCP 对外 surface 渐进式，仅在内部新增 `source-package-manager` 与 `vanilla-source-adapter` 两层。`source.bundle` 仍是 vanilla source 正式入口；`context.query` 不承载源码获取。确认默认按 Minecraft 版本粒度。
Tech Stack: TypeScript、Node.js、现有 `pnpm` monorepo、`@mcpskill/runtime-manager`、`@mcpskill/workspace-detector`、`@mcpskill/package-registry`、Vitest。

## Execution Rules
- 只在 `SKillUpdate/` 内工作。
- 不恢复任何 Go 文件或 Go 文档。
- 不把 vanilla payload、用户本地缓存或派生索引写入仓库。
- 每个源码文件保持可维护，尽量不超过 `250` 行，硬上限 `500` 行。
- public MCP surface 保持短，不为 acquisition 暴露一串新工具。
- `source-index` 必须是可选加速器，不能成为成功路径前置条件。

## Planned File Structure
### Create
- `packages/shared-types/src/source-packages.ts`
- `packages/source-package-manager/package.json`
- `packages/source-package-manager/tsconfig.json`
- `packages/source-package-manager/src/index.ts`
- `packages/source-package-manager/src/contracts.ts`
- `packages/source-package-manager/src/layout.ts`
- `packages/source-package-manager/src/confirmation.ts`
- `packages/source-package-manager/src/recipes.ts`
- `packages/source-package-manager/src/state.ts`
- `packages/source-package-manager/src/install.ts`
- `packages/source-package-manager/src/install.test.ts`
- `packages/source-package-manager/src/confirmation.test.ts`
- `packages/vanilla-source-adapter/package.json`
- `packages/vanilla-source-adapter/tsconfig.json`
- `packages/vanilla-source-adapter/src/index.ts`
- `packages/vanilla-source-adapter/src/request.ts`
- `packages/vanilla-source-adapter/src/version.ts`
- `packages/vanilla-source-adapter/src/resolve.ts`
- `packages/vanilla-source-adapter/src/resolve.test.ts`
- `apps/mcp-server/src/source-bundle-executor.ts`
- `apps/mcp-server/src/source-bundle-executor.test.ts`

### Modify
- `packages/shared-types/src/index.ts`
- `packages/shared-types/src/runtime.ts`
- `packages/agent-harness/src/task-route.ts`
- `apps/mcp-server/src/evidence-plan.ts`
- `apps/mcp-server/src/request-handler.ts`
- `apps/mcp-server/src/public-api.test.ts`
- `apps/mcp-server/package.json`
- `package.json`

## Task 1: Add Shared Contracts For Source Package Acquisition
### Files
- Create: `packages/shared-types/src/source-packages.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/runtime.ts`

### Deliverables
- `SourcePackageId`
- `SourcePackageNamespace`
- `SourcePackageArtifactType`
- `SourcePackageVariant`
- `SourcePackageConfirmation`
- `SourcePackageInstallState`
- `SourcePackageEnsureResult`
- `VanillaSourceResolveStatus`

### Key Rules
- contract 要清楚区分：
  - `needs_confirmation`
  - `installing`
  - `ready`
  - `install_failed`
- confirmation 默认语义为 `package-version`

## Task 2: Build `@mcpskill/source-package-manager`
### Files
- Create: `packages/source-package-manager/*`

### Deliverables
- local store layout helper
- confirmation state read/write
- recipe lookup
- install state read/write
- `ensureSourcePackageInstalled(...)`

### Phase A Scope
- 先支持本地 recipe 执行框架和 state 机
- 先不接远端仓库 release 下载
- 先允许 stub recipe executor，以便把 MCP 路径先跑通

### Required Tests
- 未确认时返回 `needs_confirmation`
- 已确认但未安装时进入 install
- 安装完成后返回 `ready`
- 重复 ensure 不重复安装

## Task 3: Build `@mcpskill/vanilla-source-adapter`
### Files
- Create: `packages/vanilla-source-adapter/*`

### Deliverables
- vanilla symbol / package / path request detection
- 基于 `workspace-detector` 结果的版本解析
- 本地 source pack exact-path 读取
- fallback scan with budget
- unresolved / confirmation / no-match 的稳定语义

### Key Rules
- 只处理 vanilla source 路径，不承担 package install 细节
- 不把 docs 路线混进来
- 不要求 `source-index` 存在

### Required Tests
- `net.minecraft.*` 命中 vanilla request
- runtime 版本缺失时返回 `version_unresolved`
- 本地未安装且未确认时返回 `needs_confirmation`
- 本地安装后能返回 exact file

## Task 4: Wire Into MCP `source.bundle` Execution
### Files
- Create: `apps/mcp-server/src/source-bundle-executor.ts`
- Modify: `apps/mcp-server/src/evidence-plan.ts`
- Modify: `apps/mcp-server/src/request-handler.ts`
- Modify: `apps/mcp-server/package.json`

### Deliverables
- `source.bundle` 内部 executor
- `vanilla_source` candidate
- `needs_confirmation` 结构化返回
- confirm 后重试的执行骨架

### Key Rules
- 不新增一组 public MCP acquisition tools
- `source.bundle` 保持统一入口
- request trace 要记录：
  - selected package id
  - confirmation required
  - install attempted
  - install result

## Task 5: Route And Harness Adjustments
### Files
- Modify: `packages/agent-harness/src/task-route.ts`
- Modify: `apps/mcp-server/src/evidence-plan.ts`

### Deliverables
- 在 modpack / external-heavy 场景中，当目标明显是 `net.minecraft.*` 时，优先视作 source evidence
- 不再把 vanilla source 当作 docs fallback

### Required Tests
- vanilla 请求产生 `source.bundle` 优先路径
- docs-only 请求不被错误路由到 vanilla source

## Task 6: Add Initial Review And Verification
### Files
- Create: `docs/reviews/2026-04-24-on-demand-vanilla-source-acquisition-verification.md`

### Required Verification
- `pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test`
- 至少一组 `needs_confirmation` 返回值记录
- 至少一组 install state 转换记录
- 至少一组 installed source exact-path resolve 记录

## Recommended Commit Slices
1. shared contracts
2. source-package-manager skeleton
3. vanilla-source-adapter skeleton
4. mcp-server wiring
5. verification docs

## Immediate Next Slice
最合适的下一步不是一口气写完全部逻辑，而是：
1. 先补 shared contracts
2. 再补 `source-package-manager` 的 confirmation + install state
3. 然后把 `needs_confirmation` 语义接进 `source.bundle`

这样可以先把最关键的交互边界锁住，再逐步补 acquisition recipe 的真实执行。
