# On-Demand Vanilla Source Acquisition Design
Date: 2026-04-24
Author: m1hono
Status: Drafted after TypeScript-only reset
Scope: `SKillUpdate` 中 vanilla Minecraft 原版源码的按需获取、用户确认、本地安装、派生缓存与 `source.bundle` 路由设计

## Purpose
当前仓库已经明确切到全 TypeScript 路线，并且不再保留旧 Go 实现。

这使 vanilla source 的设计也必须一起纠正：
- 原版源码不能再作为仓库内预置资料存在
- 但系统又已经知道如何完整获取某个 Minecraft 版本的原版源码
- 因为分发原则，真正的 payload 不能直接存入仓库
- agent 又必须能在需要时稳定拿到这套源码，而不是把时间浪费在搜索不存在的项目源码上

本设计回答的是：
> 如何让 `SKillUpdate` 在不把 vanilla payload 放进仓库的前提下，仍然以 TypeScript 方式稳定、可审计地按需获取原版源码，并把它接进现有 MCP 与 harness 逻辑。

## Core Decisions
### 1. Vanilla source 改为按需获取，不再仓库预置
仓库内只允许存在：
- acquisition recipe
- manifest schema
- provenance 说明
- digest / 校验逻辑
- 本地安装与派生缓存逻辑

仓库内不允许存在：
- 完整 vanilla source payload
- 用户本地生成的 source pack
- 用户本地派生的 sqlite / index / snippet cache

### 2. `source.bundle` 是 vanilla source 的正式入口
vanilla source 不是 docs，不应挂到 `context.query`。

原因：
- 它本质上是源码材料，不是参考文档
- 它可能需要触发获取、安装、索引和文件读取
- 它需要按 symbol / package / path 做源码级解析

因此：
- `context.query` 继续负责 docs、ProbeJS、typed context、轻量结构化知识
- `source.bundle` 负责 workspace source、jar source、以及 vanilla source

### 3. 用户确认默认按 Minecraft 版本粒度生效
本设计采用默认假设：
- 用户对 `minecraft/<version>/source-pack/named` 单独确认
- 例如允许 `minecraft/1.20.1` 不代表自动允许 `minecraft/1.21.1`

这样做的原因：
- 语义最清晰
- 更符合分发原则
- 更适合后续做版本级清理、空间管理与审计

后续如果需要，也可以在此基础上扩展：
- 全局允许 vanilla source acquisition
- 一次确认某个 major/minor 版本线

但这些都不是 phase A 默认行为。

### 4. `source-pack` 是基础材料，`source-index` 是可选加速器
对 vanilla 而言：
- `source-pack` 提供真实源码
- `source-index` 只负责文件定位、symbol 到 path 的加速

没有 `source-index`：
- 系统仍然必须可以工作

没有 `source-pack`：
- 才应视为 vanilla backend 尚未安装

### 5. 本地安装与派生缓存全部归 MCP 管理
vanilla source 的生命周期必须归 `SKillUpdate` 的 MCP 层管理，而不是归仓库、skill 或外部手工脚本管理。

MCP 负责：
- 判断目标版本
- 判断本地是否已安装
- 判断是否已有用户确认
- 执行获取 job
- 做 digest 校验
- 安装到 runtime local store
- 维护 derived cache
- 做失效、重建与清理

## Architecture
系统拆成三层：

```text
source.bundle request
  -> harness route / evidence plan
  -> vanilla-source-adapter
    -> source-package-manager
      -> acquisition recipe
      -> local package cache
      -> derived cache
  -> source references / multi-file result
```

### Harness Layer
harness 的职责：
- 识别 `net.minecraft.*` 请求
- 明确这不是 docs 路线
- 在整合包场景下优先使用 workspace runtime 来确定 Minecraft 版本
- 把 vanilla source 作为 source-side evidence，而不是 docs fallback

### Vanilla Source Adapter
这个 adapter 的职责：
- 判断查询是否命中 vanilla symbol / package / path
- 根据 workspace runtime 解析目标 Minecraft 版本
- 检查本地 source pack 是否已安装
- 如果未安装，则返回结构化 `needs_confirmation`
- 如果已安装，则读取 source pack 并返回源码引用

它不负责：
- 直接下载 payload
- 维护 release registry
- 决定用户确认策略

### Source Package Manager
这个 manager 的职责：
- 根据 package id 和 variant 生成 acquisition plan
- 管理下载、安装、校验、锁和本地 state
- 管理 derived cache
- 提供 install / ensure / release / invalidate API

它不负责：
- 判定用户请求是不是 vanilla source
- 做 symbol 查询策略
- 做 harness 路由决策

## Package Boundaries
### New Package: `@mcpskill/source-package-manager`
建议职责：
- registry manifest contract
- acquisition recipe contract
- install state contract
- local package layout
- package downloader / generator
- digest validator
- local manifest writer
- derived cache lifecycle

建议不要把版本解析、symbol 判断塞进这里。

### New Package: `@mcpskill/vanilla-source-adapter`
建议职责：
- vanilla request detection
- runtime-bound version resolution
- exact path resolution
- scan fallback
- multi-file bundle shaping
- `needs_confirmation` / `backend_missing` / `version_unresolved` 语义

### Existing Package: `@mcpskill/runtime-manager`
继续负责底层目录布局，不直接演化成 package manager。

它提供的目录应继续被复用：
- `downloads`
- `installs`
- `locks`

### Existing Package: `@mcpskill/package-registry`
继续作为最薄的 registry 结构层。

后续可以扩展为 source package manifest registry 的基础工具，但不应该直接承担下载与安装逻辑。

## Local Store Model
建议在 runtime root 下形成稳定布局：

```text
runtime/
  downloads/
    source-packages/
      minecraft/
        1.20.1/
          named/
            payload.tmp
            manifest.json
  installs/
    source-packages/
      minecraft/
        1.20.1/
          source-pack/
            named/
              package.json
              files/
          source-index/
            named/
              package.json
              files/
  locks/
    source-packages/
      minecraft-1.20.1-source-pack-named.lock
      minecraft-1.20.1-source-pack-named.confirmation.json
```

### Confirmation State
建议把确认状态保存为本地 state，而不是只靠对话记忆：

```json
{
  "packageId": "minecraft-1.20.1-source-pack-named",
  "scope": "package-version",
  "approvedAt": "2026-04-24T02:00:00Z",
  "source": "explicit-user-confirmation"
}
```

这样做的目的：
- 会话外可复用
- 可审计
- 不依赖 agent 自己“记住了没”

## Acquisition Model
### Recipe-Driven
vanilla source 的获取逻辑应以 recipe 驱动，而不是写死在单一脚本中。

每个 recipe 至少包含：
- `packageId`
- `namespace`
- `minecraftVersion`
- `variant`
- `provenance`
- `steps`
- `expectedDigests`

### Generation / Download Hybrid
这里的 acquisition 不必强行限定为“纯下载”或“纯生成”。

对系统来说更合理的抽象是：
- recipe 执行后，最终产出一个本地 `source-pack`

因此内部步骤可以是：
- 下载上游材料
- 调用已有生成流程
- 解压与重组目录
- 写入 package manifest
- 校验 digest

只要最终产物稳定即可。

## MCP Behavior
### Successful Path
当请求命中 vanilla source 且本地已存在已安装 source pack：
- `source.bundle` 直接返回源码文件引用
- 如有 `source-index` 则优先用 index 加速
- 如无 index 则走 path derive 或 scan fallback

### Confirmation Required Path
当请求命中 vanilla source 但本地未安装，且当前版本未获得确认：
- 不直接失败成模糊 backend missing
- 返回结构化 `needs_confirmation`

建议结构类似：

```json
{
  "matched": false,
  "status": "needs_confirmation",
  "packageId": "minecraft-1.20.1-source-pack-named",
  "minecraftVersion": "1.20.1",
  "summary": "Vanilla source for Minecraft 1.20.1 is not installed locally and requires explicit approval before acquisition."
}
```

### Approved Retry Path
用户确认后：
- MCP 记录 confirmation state
- 触发 ensure-installed
- 安装成功后重试当前解析
- 仍由 `source.bundle` 返回最终源码结果

### Failure Path
以下失败必须区分：
- `version_unresolved`
- `needs_confirmation`
- `acquisition_failed`
- `install_validation_failed`
- `installed_but_no_match`

不能再混成一种 “not found”。

## Routing Integration
### Agent Harness
需要新增或调整的行为：
- 把 vanilla source 视为 source evidence，而不是 docs evidence
- 在 modpack / external-only workspace 中，如果请求目标明显是 `net.minecraft.*`，允许直接走 vanilla path
- 把版本判定优先绑定到 workspace runtime detection

### MCP Server Evidence Plan
需要增加一个明确的 candidate 类型，语义类似：
- provenance: `vanilla_source`
- preferred tool: `source.bundle`
- tier: `primary`

而不是把它塞进：
- `docs_lookup`
- `workspace_source`

因为它既不是 docs，也不是项目内源码。

## Multi-File And Token Efficiency
vanilla source 也必须遵守当前系统的节流原则：
- 优先 exact path
- 再用 symbol-derived path
- 再用 indexed lookup
- 最后才允许 budgeted scan

多文件请求时：
- 优先返回最相关 `N` 个文件
- 返回稳定 path 列表与原因
- 不应把整个源码文件夹直接塞给模型

这和 jar source、多文件搜索应保持同一套预算语义。

## Privacy And Distribution
### Repo Boundary
不能进入仓库的内容：
- vanilla source payload
- 用户本地生成的索引
- 用户本地缓存的 modpack 派生数据

### Local Derived Data
可以在本地维护但不进入仓库的内容：
- sqlite
- file index
- symbol shards
- snippets
- hot cache

这与 `mdm-sources` 设计一致：
- 正式共享包在正式仓库
- 本地派生物只在 MCP runtime store 中存在

## Non-Goals
- 本阶段不要求一次支持所有 loader remap 变体
- 本阶段不要求先做公共 release 仓库联动
- 本阶段不要求 method-level 全量索引
- 本阶段不要求把 mod source acquisition 一起做完
- 本阶段不要求让 `context.query` 接手源码级职责

## Recommended Phase Order
### Phase A
- 写 TypeScript contracts
- 引入 `source-package-manager`
- 引入 `vanilla-source-adapter`
- 固定 `needs_confirmation` 语义
- 在本地 recipe 基础上打通单版本 install

### Phase B
- 接入 `source-index`
- 增加 multi-file acceleration
- 增加 cache invalidation 和 cleanup policy

### Phase C
- 抽象成通用 source package acquisition
- 扩展到 mod source / docs package / migration package 的统一安装层

## Final Recommendation
后续实现应坚持以下原则：
- public MCP surface 保持渐进，不暴露一堆新工具
- vanilla source 继续挂在 `source.bundle`
- acquisition、install、derived cache 全部下沉到 TypeScript MCP 内部
- confirmation 默认按版本粒度
- `source-pack` 是必要材料，`source-index` 是可选加速
