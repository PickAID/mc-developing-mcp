# MDM Sources Registry And MCP Cache Design
Date: 2026-04-19
Author: m1hono
Status: Approved in conversation for spec drafting, pending user review
Scope: `mdm-sources` 正式资料包仓库、registry/release 模型、以及 `SKillUpdate` 所属 MCP 的本地包缓存与派生缓存体系设计

## 目的
当前 `SKillUpdate` 已经完成了 `vanilla source phase 1`：
- `net.minecraft.*` 请求会走 `ScenarioVanillaSymbol`
- 版本由 `workspace.detect.CurrentRuntime` 驱动
- `source-pack` 已经能作为离线真源码 backend

但它仍缺一层更长久的资料分发与缓存体系：
- 正式可共享资料应该放在哪里
- release 怎么组织
- 多版本、多生态、多资料形态如何拆包
- AI 本地生成的 sqlite / index / snippet cache 应该归谁维护
- 隐私性本地缓存如何与正式仓库分离

本设计回答的是：
> 如何把 `mdm-sources` 设计成正式资料包发布源，并让 MCP 自己维护本地派生缓存，而不是把缓存逻辑混进仓库。

## 版本纠正
本设计使用新的 Minecraft 版本号体系，而不是旧的 `1.xx.x` 形式。

- Minecraft Java `26.1` 发布于 `2026-03-24`
- Minecraft Java `26.1.1` 热修发布于 `2026-04-01`
- NeoForge 已进入 `26.1` 版本线

因此本设计中的路径、manifest、release asset 命名都以：
- `minecraft/26.1`
- `minecraft/26.1.1`
- `neoforge/26.1`

为准，不使用 `1.26.1`。

## 核心结论
### 1. `mdm-sources` 只负责正式发布资料
`mdm-sources` 的职责应严格限制在：
- package source
- package manifest
- registry
- release workflow
- release assets

它不承载：
- 用户私有缓存
- workspace 相关派生物
- AI 运行期临时 sqlite
- 本地 snippet / shard / hot cache

### 2. 本地派生逻辑必须归 MCP
所有以下能力都应属于 `SKillUpdate` 所属 MCP：
- 下载正式包
- 校验 digest
- 解包到本地 package cache
- 派生 sqlite / symbol index / snippet shard
- 维护 derived manifest
- 做失效与清理

也就是：
- 正式资料归 `mdm-sources`
- 派生缓存归 MCP

### 3. 包路径采用 `namespace-first + version + artifact-type`
正式包的主键应稳定、可推导、少改名。

推荐路径骨架：
- `packages/minecraft/26.1/source-pack/named/...`
- `packages/minecraft/26.1/source-index/named/...`
- `packages/minecraft/26.1/docs/core/...`
- `packages/minecraft/26.1/docs/ui/...`
- `packages/minecraft/26.1/docs/rendering/...`
- `packages/minecraft/26.1/docs/shader/...`
- `packages/minecraft/26.1/docs/coremod/...`
- `packages/neoforge/26.1/docs/core/...`
- `packages/mod/jei/<version>/source-pack/...`

### 4. 分类不进主路径，只进元数据
`library/content/tooling/api/docs` 等分类只放在 manifest 标签里，不放进正式路径。

这样可以避免：
- 路径频繁变化
- 同一 mod 因分类认知变化而重命名
- release asset 命名不稳定

### 5. release 采用 batch 模式
一次 release 可以发布多个包，不做“一个包一个 release/tag”。

原因：
- 更适合同版本资料同时更新
- 更适合统一生成 registry 快照
- 更适合后续大版本 bootstrap

### 6. `source-pack` 是基础材料，`source-index` 只是加速器
对 `vanilla source` 而言：
- `source-pack` 提供真源码材料
- `source-index` 只提供文件定位加速

没有 index：
- 仍然能工作

没有 source-pack：
- 才算 backend 缺失

## 当前状态
### 已有仓库
同级目录中已经存在：
- `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`

当前骨架非常薄：
- `index.json`
- `modules/core-docs/module.json`
- `modules/docs-search/module.json`
- `modules/jar-content-index/module.json`

### 当前缺口
- 还没有 `packages/` 正式目录结构
- 还没有 registry 层
- 还没有 release asset 命名规范
- 还没有 batch release workflow
- 还没有 MCP 内部 `RegistryClient / PackageManager / DerivedManager`
- 还没有把 `vanilla-source-index` 设计为 MCP 本地 derived accelerator

## 设计目标
- 把 `mdm-sources` 变成正式可共享资料源
- 把本地派生缓存严格收回 MCP 内部
- 支持多生态、多版本、多 artifact type 的稳定拆包
- 支持 batch release
- 支持按需下载与离线使用
- 保持外部语义稳定，不为 phase A 引入复杂全文搜索系统
- 允许 AI 后续在本地自由维护各种派生小包，而不污染正式仓库

## 非目标
- 本设计不要求现在就完成所有生态的资料入库
- 本设计不要求把所有缓存推回 `mdm-sources`
- 本设计不要求 phase A 实现 method/member 级检索
- 本设计不要求现在就做公共外部 API 改造
- 本设计不要求把 `SKillUpdate` 现有 `sourcepack` fallback 删除

## 总体架构
系统拆成两层加一个消费端。

### `mdm-sources`
职责：
- 保存 package source
- 保存 package manifest
- 保存 registry
- 执行 release workflow
- 发布 release assets

这是正式、共享、可审计层。

### MCP local store
职责：
- 下载 release asset
- 本地 package cache
- derived cache
- digest 校验
- schema 失效判断
- 清理与重建

这是私有、运行时、可丢弃层。

### `SKillUpdate`
职责：
- 做 routing / provider orchestration
- 根据查询目标选择 `derived cache` 或 `package cache`
- 保持现有 pipeline 的语义稳定

## 包命名与目录模型
### 主路径
推荐目录结构如下：

```text
mdm-sources/
  registry/
    index.json
    packages/
      minecraft-26.1-source-pack-named.json
      minecraft-26.1-source-index-named.json
      neoforge-26.1-docs-core.json
  packages/
    minecraft/
      26.1/
        source-pack/
          named/
            package.json
            payload/
        source-index/
          named/
            package.json
            payload/
        docs/
          core/
            package.json
            payload/
          ui/
            package.json
            payload/
          rendering/
            package.json
            payload/
          shader/
            package.json
            payload/
          coremod/
            package.json
            payload/
      26.1.1/
        source-pack/
          named/
            package.json
            payload/
    neoforge/
      26.1/
        docs/
          core/
            package.json
            payload/
    mod/
      jei/
        <version>/
          source-pack/
            package.json
            payload/
```

### 主键规则
- `namespace`
  - `minecraft`
  - `neoforge`
  - `forge`
  - `fabric`
  - `quilt`
  - `mod/<modid>`
- `version`
  - 命名空间自己的版本号
- `artifact-type`
  - `source-pack`
  - `source-index`
  - `docs/core`
  - `docs/search`
  - `docs/ui`
  - `docs/rendering`
  - `docs/shader`
  - `docs/coremod`
  - `jar-content-index`
  - 后续可扩展 `symbols`、`snippets`、`migration-map`、`distilled-patterns`、`api-proof-index`
- `variant`
  - `named`
  - `official`
  - `intermediary`

### 分类规则
以下内容只放 manifest 标签：
- `library`
- `content`
- `tooling`
- `api`
- `docs`
- `client-visual`
- `ui`
- `rendering`
- `shader`
- `coremod`

不进入正式路径。

### Client Visual 与源码/文档预留
UI、rendering、shader、coremod 不能混进 `docs/core` 变成大包。它们应作为可选小包发布，并允许 MCP 本地派生索引：

- `docs/ui`：GUI 绘制抽象、widget/layout、stretch/scaling metadata、font/lang、input/narration。
- `docs/rendering`：renderer ownership、buffer/render type、blend/depth/cull/light state、render target lifecycle。
- `docs/shader`：shader/post chain resource、uniform/sampler formula、reload/fallback、可选外部参考 provider 的摘要。
- `docs/coremod`：mixin/transformer/coremod 边界、崩溃排查、安全限制、版本迁移风险。

外部 shader 参考不进入正式仓库原文。若以后支持，应由 MCP 作为本地可选 provider 获取，要求用户提供 API key，并只派生当前任务需要的 compact formula/evidence summary。

## Package Manifest
每个正式包都要有一个 manifest，建议字段如下：

```json
{
  "id": "minecraft-26.1-source-pack-named",
  "namespace": "minecraft",
  "version": "26.1",
  "artifact_type": "source-pack",
  "variant": "named",
  "tags": ["vanilla", "source", "official-release"],
  "source_provenance": {
    "upstream": "minecraft",
    "release_date": "2026-03-24"
  },
  "dependencies": [],
  "file_layout": {
    "root": "payload",
    "sources_dir": "payload/sources"
  },
  "release_filename": "minecraft-26.1-source-pack-named.tar.zst",
  "checksum": {
    "sha256": "9f4b0bdc80ac3f6f8b4b0d4d8d4b91b7572f4653d8220dd7fd90db0bc6cf9777"
  }
}
```

### Manifest 设计原则
- `id` 能唯一对应一个 release asset
- `namespace + version + artifact_type + variant` 应可推导 `id`
- `tags` 只负责附加分类，不参与路径主键
- `checksum` 由 release 产出后回填或生成 registry 时写入

## Registry 模型
### 轻量摘要
`registry/index.json` 只保留快速决策所需字段：
- package id
- namespace
- version
- artifact type
- variant
- latest release tag
- latest digest

它用于：
- MCP 快速比较本地是否过期
- 快速发现某个版本/某类包是否存在

### 详细条目
`registry/packages/<package-id>.json` 保存完整条目：
- manifest 摘要
- release asset URL
- digest
- release tag
- build time
- upstream provenance
- 依赖关系

这样 MCP 不必遍历整个仓库树。

## Release Workflow
### 采用 batch release
一次 workflow 应支持：
- 找出本次变更涉及的 package
- 只构建受影响的 release assets
- 更新 `registry/index.json`
- 更新受影响的 `registry/packages/*.json`
- 创建一个 batch release tag
- 上传多个 release assets
- 上传 registry 快照

### release 命名
示例：
- `batch-2026-04-19-minecraft-26.1-bootstrap`
- `batch-2026-04-20-neoforge-26.1-docs-refresh`

### asset 命名
示例：
- `minecraft-26.1-source-pack-named.tar.zst`
- `minecraft-26.1-source-index-named.zip`
- `minecraft-26.1-docs-core.zip`
- `neoforge-26.1-docs-core.zip`

## MCP 本地存储模型
### package cache
package cache 用来保存正式 release asset 的本地展开结果。

建议骨架：

```text
cache/
  packages/
    minecraft/
      26.1/
        source-pack/
          named/
            asset.json
            payload/
```

约束：
- 只对应正式 release asset
- 同一 digest 不重复解包
- 旧 digest 可延后清理

### derived cache
derived cache 保存 MCP 派生物。

建议骨架：

```text
cache/
  derived/
    minecraft/
      26.1/
        source-index-sqlite/
          manifest.json
          index.sqlite
        snippet-shards/
          manifest.json
          shards/
```

### derived manifest
每个派生物都应有 manifest：

```json
{
  "parent_asset_id": "minecraft-26.1-source-pack-named",
  "parent_digest": "9f4b0bdc80ac3f6f8b4b0d4d8d4b91b7572f4653d8220dd7fd90db0bc6cf9777",
  "derived_kind": "source-index-sqlite",
  "mcp_schema_version": "1",
  "builder_version": "skillupdate-mcp-1",
  "workspace_scope": "global",
  "privacy_scope": "local-only"
}
```

用途：
- 判断派生物是否还能复用
- 判断上游 package 更新后是否需要重建
- 区分全局缓存与 workspace 私有缓存

## MCP 下载与失效策略
### 下载顺序
MCP 应按以下顺序工作：
1. 查本地 derived cache
2. miss 后查本地 package cache
3. 再 miss 才查远程 registry
4. 如有匹配 release asset，则下载并校验 digest
5. 解包到 package cache
6. 仅在需要时派生 sqlite / snippets / index

### 失效规则
#### package cache 失效
触发条件：
- registry 指向了新的 digest

行为：
- 旧正式包不再是首选
- 可以延后清理，不必立刻删除

#### derived cache 失效
触发条件：
- `parent_digest` 变化
- `mcp_schema_version` 变化
- `builder_version` 变化
- `workspace_scope` 不匹配

行为：
- 直接标记失效
- 查询时触发重建

## `SKillUpdate` 接入模型
### 新边界
不要把 package 下载、解包、派生逻辑混进现有 `vanilla.Provider`。

建议 MCP 内部分成这些单元：
- `RegistryClient`
- `PackageLocator`
- `PackageManager`
- `DerivedManager`
- `VanillaIndexResolver`

### 现有 provider 的职责
`vanilla.Provider` 只保留：
- 版本判定
- backend 优先级选择
- provenance 与错误语义统一

### phase A 的优先级
对 `ScenarioVanillaSymbol`：
1. 本地 derived `source-index`
2. 本地 package cache 中的 `source-pack`
3. 如允许联网且本地缺失，则下载正式 release asset
4. 仍无 `source-pack` 时返回 backend missing

## Phase A 范围
你已明确选择 `A`：先做纯加速层，不改现有对外语义。

这一阶段只做：
- `FQCN -> file`
- `simple symbol + packageHint -> file`
- `simple symbol -> candidate files`

这一阶段明确不做：
- method/member 级搜索
- 全文 FTS
- snippet ranking 引擎
- 新增复杂外部查询面

### 为什么这样拆
这样可以：
- 保持 `vanilla-source-pack` 是稳定兜底
- 把 `vanilla-source-index` 严格限定为 accelerator
- 避免 phase A 直接膨胀成一个复杂检索平台

## 建议的实施分解
本设计已经超过一个紧凑实现计划的舒适范围，建议拆成 3 个顺序阶段：

### 阶段 1：`mdm-sources` 基础化
- 建 `packages/` 正式目录
- 建 `registry/`
- 定 `package manifest`
- 建 batch release workflow
- bootstrap `minecraft/26.1`、`minecraft/26.1.1`、`neoforge/26.1`

### 阶段 2：MCP package substrate
- `RegistryClient`
- `PackageLocator`
- `PackageManager`
- `DerivedManager`
- package cache / derived cache 协议

### 阶段 3：`vanilla-source-index phase A`
- 建 `VanillaIndexResolver`
- 优先查 derived index
- fallback 到 `sourcepack.Resolver`
- 补全验证与 live return 文档

## 风险与约束
- 不应把“分类”做成路径主键，否则长期会频繁 rename
- 不应让 `source-index` 变成 source 能力前提
- 不应把用户私有缓存推回 `mdm-sources`
- 不应让 phase A 提前承载 method/member/full-text 复杂搜索

## 与现有实现的关系
本设计不推翻已完成的 `vanilla source phase 1`。

它是在现有能力上补三件事：
- 正式资料包分发体系
- MCP 本地包与派生缓存体系
- `source-index` 的受控加速层

因此：
- `workspace.classify` 仍然保留
- `resolve.Planner` 仍然保留
- `sourcepack.Resolver` 仍然保留
- `vanilla.Provider` 只是从“直接用 source-pack”升级为“先 index、再 source-pack”

## 结论
应采用双层模型：
- `mdm-sources` 作为正式可共享 package source + release 仓库
- MCP 作为本地包缓存与派生缓存的唯一维护者

正式包与本地缓存分离后：
- 仓库可长期维护
- 隐私边界清晰
- agent 仍能自由做本地加速优化
- `vanilla-source-index phase A` 可以在不破坏 phase 1 语义的前提下推进
