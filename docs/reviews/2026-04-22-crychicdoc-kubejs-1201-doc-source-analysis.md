# CrychicDoc KubeJS 1.20.1 文档源分析

Date: 2026-04-22
Author: m1hono
Scope: `SKillUpdate` 后续文档源/离线包/`docs_lookup` 设计阶段，对 CrychicDoc 中 `KubeJS 1.20.1` 资料的可用性判断

## 结论

这批 CrychicDoc 内容值得接入，而且价值比普通社区教程高。

但它不应被当作“全局必备文档库”，而应被定义为：

- `可选但高优先级的 KubeJS 1.20.1 专用文档包`
- 作用域限定在：
  - `Minecraft 1.20.1`
  - `KubeJS`
  - `KubeJS 附属模组`
  - `KubeJS data/assets 相关的数据包/资源包语境`
- 不应被泛化到：
  - `Java 模组开发通用问答`
  - `1.21+`
  - `纯 NeoForge/Forge Java API`
  - `全版本 datapack 通用规则`

对当前 TypeScript MCP 设计的直接意义是：

1. 它可以成为 `probejs_types` 之后、通用 docs 之前的中间层证据源。
2. 它应该通过“派生后的结构化 docs package”进入系统，而不是把原始 Markdown 直接暴露给 agent。
3. 它必须带严格版本围栏，否则会把 1.20.1 的写法污染到 1.21+。

## 为什么它不是普通教程

从目录结构看，它不是单篇散文，而是接近“半结构化知识库”。

证据：

- 顶层 `KubeJS` 目录明确分版本，包含 `1.21`、`1.20.1`、`1.19.2`、`1.18.2`。
  - 来源：`/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/index.md:3`
- `1.20.1` 下面又有明确的 `Introduction`、`KubeJSCourse`、`Upgrade`、`CodeShare` 等分区。
  - 来源：`/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/index.md:18`
- `KubeJSCourse/SUMMARY.md` 是一份完整课程索引，覆盖：
  - 文件夹结构
  - 事件总表
  - 配方增删改
  - ProbeJS
  - LootTables
  - 资源文件
  - 进阶事件/世界生成/LoadClass
  - Addon 教程
  - 实战项目分享
  - 来源：`/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/SUMMARY.md:6`

这说明它已经满足“可被索引成结构化文档包”的前提，不需要 agent 逐页盲读。

## 它能补当前系统什么短板

### 1. 补 KubeJS 文件语义，而不是补 Java 源码

`FileStructure.md` 明确描述了：

- `assets`
- `data`
- `client_scripts`
- `server_scripts`
- `startup_scripts`

各自的职责与重载方式，还明确指出：

- `startup_scripts` 用于注册新内容
- 注册类内容不能热重载，只能重启游戏
- `server_scripts` 主要承载大部分逻辑
- `assets/data` 更适合服务自己的命名空间内容，而不推荐拿来覆盖别的模组

来源：

- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/FileStructure.md:6`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/FileStructure.md:47`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/FileStructure.md:108`

这类信息无法单靠 Java 源码、Gradle 或 jar 直接推断出来，却正是 agent 在 KubeJS authoring 中最容易走错的地方。

所以它适合回答：

- 这个脚本应放在哪个文件夹
- 为什么这段注册代码不能热重载
- `assets/data` 与资源包/数据包覆盖关系是什么
- KubeJS 目录中的 datapack/resourcepack 内容该如何理解

### 2. 补 ProbeJS 工作流与故障边界

`ProbeJS.md` 和课程版 `ProbeJS.md` 给出的不是泛泛介绍，而是实际工作流：

- 需要在游戏里运行 dump 命令生成类型文件
- VS Code 的 TypeScript server 需要在某些情况下手动重启
- ProbeJS 6 / 7 的路径与生成位置存在差异
- 自动补全、方法查看、JSDoc 修正类型、重载方法选择等都有具体说明

来源：

- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/ProbeJS.md:21`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/ProbeJS.md:140`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/ProbeJS/ProbeJS.md:10`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/ProbeJS/ProbeJS.md:40`

这对当前 MCP 非常重要，因为我们之前已经明确：

- `probejs_types` 应先于 docs
- 但 ProbeJS 本身不总是存在，也不总是正确

CrychicDoc 这部分内容刚好可以作为“ProbeJS 存在但用户不会用”或“类型不完整时怎么解释”的中间知识层。

### 3. 补事件总表与文件夹归属

`AllEvent.md` 以及 `Introduction/Event/.../EventList.md` 这两组内容价值很高，因为它们把事件做成了可枚举表格：

- 哪个事件属于 `startup_scripts`
- 哪个事件属于 `server_scripts`
- 哪个事件属于 `client_scripts`
- 每个事件大致用途是什么

来源：

- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/AllEvent.md:7`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Event/ServerScript/EventList.md:9`

这类资料非常适合被结构化成：

- `event_catalog`
- `script_folder_policy`
- `intent -> likely event families`

它比单纯全文检索更适合 agent 使用，因为 agent 常问的是：

- “这个需求该用哪个事件”
- “这事件应该写在 server 还是 startup”
- “哪些事件和 loot/recipe/player inventory 相关”

### 4. 补 Addon 生态，而不仅是 KubeJS 本体

`SUMMARY.md` 和 `Introduction/Addon/*` 清楚覆盖了多个附属模组：

- LootJS
- ProbeJS
- MoreJS
- JEI/REIJS
- EntityJS
- CreateJS
- PonderJS
- 以及其他 addon

来源：

- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/SUMMARY.md:68`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/LootJs/LootJs.md:1`

这点非常关键，因为很多整合包问题并不是 “KubeJS 核心 API 怎么用”，而是：

- `LootJS` 的写法
- `CreateJS` 的 recipe/event 扩展
- `PonderJS` 的场景脚本

这部分只靠 KubeJS 本体类型文件并不够。

### 5. 补“约定与经验性规则”

例如 `LootJs.md` 中会明确说明：

- 推荐在修改掉落时优先用 LootJS
- 某些调用顺序会影响结果
- 某些写法在不同版本间存在差异

来源：

- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/LootJs/LootJs.md:3`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/LootJs/LootJs.md:39`
- `/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/LootJs/LootJs.md:69`

这种知识不总能从类型或源码里直接推出来，但对实际 authoring 很重要。

## 它不能承担什么

### 1. 不能替代 Java 源码与 jar/sourcejar 查询

CrychicDoc 主要解决的是：

- KubeJS authoring
- Addon 用法
- 文件放置
- 事件选择
- 经验规则

它不能替代：

- Java 类型层级
- 外部 mod jar 源码
- Gradle 依赖源码解析
- crash stacktrace 对应 Java 实现定位

所以它的优先级必须低于：

1. workspace/source/jar 的真实证据
2. ProbeJS / d.ts / snippets

### 2. 不能跨版本泛化

这个 corpus 的最大风险就是版本污染。

证据：

- `ProbeJS` 页面明确写了 `1.20.1 使用 6.0.1`
  - 来源：`/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/ProbeJS/ProbeJS.md:10`
- 顶层目录本身就以版本隔离
  - 来源：`/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/index.md:3`
- `LootJs` 页面明确写了适用版本范围
  - 来源：`/Users/gedwen/Documents/programing/crychic/CrychicDoc/docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/LootJs/LootJs.md:14`

因此：

- 当 workspace runtime 不是 `1.20.1` 时，默认不应自动使用这包文档
- 只有当：
  - runtime 明确是 `1.20.1`
  - 或用户问题中明确提到 `1.20.1`
  - 或没有更高置信度版本信号，但 query 明确命中 `KubeJS 1.20.1`
  时，才允许升权

### 3. 不能当作“官方唯一真相”

它属于高质量社区整理资料，但本质上仍是社区语料，不是运行时真相。

因此对 agent 的使用规则应该是：

- 解释 authoring 约定、事件选择、文件放置、addon 用法时可高权重使用
- 和 ProbeJS / snippets / workspace source / jar source 冲突时，以后者为准
- 和当前实际 mod 版本冲突时，以当前版本信号为准

## 对当前 MCP 设计的落位建议

## 建议一：把它做成派生 docs package，而不是原始 Markdown 直查

用户之前已经明确不希望系统把 Markdown 本身当成和 skill 混在一起的工作物。

所以正确做法不是：

- 直接把 `.md` 内容整段喂给 agent

而是：

- 以 CrychicDoc 仓库作为原始 source
- 构建派生的 docs package
- package 内存储结构化条目

建议最小结构：

- `package_id`
- `origin = crychicdoc`
- `domain = kubejs`
- `minecraft_version = 1.20.1`
- `language = zh-CN`
- `doc_kind`
  - `course`
  - `concept`
  - `event_catalog`
  - `addon_guide`
  - `resource_layout`
  - `upgrade_note`
- `topics[]`
- `path`
- `title`
- `headings[]`
- `summary`
- `code_symbols[]`
- `event_names[]`
- `script_scopes[]`
- `addon_names[]`
- `version_fence`
- `search_terms[]`

原始 Markdown 只作为构建输入，不作为 agent 直接消费面。

## 建议二：在 `docs_lookup` 里拆出 KubeJS 专用 docs selector

对当前 TS 设计来说，下一层不一定要立刻新增公开工具，但内部执行层至少要支持：

- `general docs`
- `kubejs versioned docs`
- `addon docs`

的内部选择。

推荐内部顺序：

1. `probejs_types`
2. `crcychicdoc_kubejs_1_20_1`
3. `generic modding docs`

只在以下条件满足时插入第 2 层：

- task intent = `kubejs_authoring`
- runtime 或 user version = `1.20.1`
- query 命中以下主题之一：
  - event
  - server_scripts/startup_scripts/client_scripts
  - recipe / loot / tags
  - ProbeJS
  - LootJS / MoreJS / PonderJS / EntityJS 等 addon

## 建议三：把课程目录变成“渐进式”文档入口，而不是大而全接口

你之前要求“渐进式工具，不暴露太多方法污染使用链”，这批文档也应该遵守这个原则。

不要做成一堆外露 API：

- `list_kubejs_events`
- `list_kubejs_folders`
- `list_kubejs_addons`
- `search_crychicdoc`
- `search_crychicdoc_examples`

这种会污染调用链。

更好的做法是保留少量统一内部入口，由 executor/selector 根据 query 自动落到不同子索引：

- 事件索引
- 文件夹/生命周期索引
- addon 索引
- 示例代码索引
- 升级说明索引

对 agent 暴露的仍然只是统一的 `docs_lookup` 路径。

## 建议四：让它同时为 hints 和 retrieval 服务

这批资料不只是“回答问题”，还可以反向增强当前 harness 逻辑。

例如从文档可稳定提炼出的规则包括：

- `startup_scripts` 负责注册
- `server_scripts` 负责大部分逻辑
- `client_scripts` 偏客户端逻辑
- `assets/data` 不是首选覆盖手段
- ProbeJS 与 VS Code/TS server 有联动工作流

这些规则可以进入两层：

1. `harness prompt policy`
2. `docs retrieval ranking`

也就是：

- 它既提供回答证据
- 也提供路由与引导语义

## 建议五：把示例代码抽成可检索 snippets，但必须保留版本标签

`KubeJSCourse` 中大量章节本身带具体示例代码，适合派生成：

- `snippet_id`
- `topic`
- `version`
- `addon`
- `script_scope`
- `required_symbols`
- `body`
- `source_path`

但必须带：

- `minecraft=1.20.1`
- `kubejs_major`
- `addon_name`

否则一旦把 1.20.1 示例混到 1.21 或其他 addon 场景里，误导会很严重。

## 与当前路线的衔接

这份分析和当前已经做完的 TypeScript 分层并不冲突，反而很适合作为下一阶段输入。

当前已经有：

- `request-context`
- `request-plan`
- `evidence-plan`
- `request-handler`

CrychicDoc 最适合接入的位置是下一阶段的：

- `docs executor`
- `docs package selector`
- `evidence telemetry`

而不是回头修改前面的 public API。

## 下一步建议

下一步最合适的不是立刻扩大工具面，而是做一个内部 docs package 设计切片：

1. 定义 `docs package manifest` 的 TypeScript 结构
2. 先为 CrychicDoc `KubeJS 1.20.1` 建一个最小派生包样例
3. 给 `request-handler` 未来的 `context.query` executor 增加 package selection trace
4. 验证下面几个 query 是否能正确选中这包：
   - `这个配方事件应该写在 server_scripts 还是 startup_scripts`
   - `1.20.1 的 ProbeJS 怎么生成类型和 snippets`
   - `LootJS 修改掉落时应该优先用什么`
   - `KubeJS data/assets 为什么不适合覆盖其他 mod`

这一步做好后，再继续做真正的 docs executor，链路会更干净。
