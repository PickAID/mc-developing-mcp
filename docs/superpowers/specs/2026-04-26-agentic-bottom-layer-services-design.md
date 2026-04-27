# Agentic Bottom-Layer Services Design
Date: 2026-04-26
Author: m1hono
Status: Implemented first TypeScript slice
Scope: `SKillUpdate` 内部底层服务：包管理器、SQLite source index、Gradle source discovery、JDTLS profile、ProbeJS/d.ts、datapack/assets、jar content extraction、harness prompt injection

## Goal
把 MCP 从“工具集合”推进成一个小 agent 式的 Minecraft 开发辅助层：它先识别工作区和可用底层能力，再决定证据链优先级，避免 agent 把 token 浪费在不存在的源码、错误的 JS 假设、或泛泛文档搜索上。

## Architecture
本阶段采用分层设计，参考 `claude-code-best/claude-code` 的动态上下文、工具路由、LSP 管理、少量公共入口思想，但实现保持 `SKillUpdate` 自有 TypeScript 代码。

```text
MCP request
  -> workspace detector
  -> service profile
      -> Gradle source archive discovery
      -> JDTLS environment/profile detection
      -> ProbeJS/d.ts discovery/search/read
      -> datapack data/assets discovery/search/read
      -> source package manager state
      -> SQLite source-index discovery
  -> harness/task route
  -> prompt fragment injection
  -> progressive public tools
```

## Core Decisions
1. Public MCP surface 不扩散。
   仍然保持 `workspace.analyze`、`source.bundle`、`context.query`、`migration.analyze` 这种渐进入口。新增复杂能力放在内部 service/profile/executor 层。

2. SQLite 是 source package 的正式索引层。
   `source-pack` 安装后自动生成 `source-index.sqlite`。SQLite 只做定位和检索加速，真实文件仍是权威材料。

3. ProbeJS/KubeJS 不视作普通 JavaScript 项目。
   KubeJS 证据优先来自 ProbeJS `.d.ts`、snippets、items、registries，再到文档；不鼓励 agent 直接套通用 JS 工程习惯。

4. Datapack 和 assets 是一等内容。
   系统必须能识别 `data/**` 和 `assets/**`，因为 mod jar、整合包、资源包和数据包排查都需要这两类内容。

5. LSP 先完成 profile 和 operation contract。
   本阶段定义 JDTLS 可用性、Java runtime、workspace data dir、Java workspace signals、operation contract。真正 JSON-RPC session manager 留给下一阶段。

6. 本地派生缓存归 MCP 管理。
   用户本地缓存、source-index、modpack 派生数据不进入仓库；公开仓库只维护 schema、recipes、registry、测试夹具和代码。

## Implemented Bottom-Layer Packages
- `@mcpskill/source-index`: SQLite source index builder/query/reader，支持 file metadata、FTS5、Java symbol extraction。
- `@mcpskill/source-package-manager`: 安装 source pack 时自动执行 `build_source_index`，产物包含 `source-index.sqlite`。
- `@mcpskill/kubejs-types-adapter`: ProbeJS roots、`.d.ts`、snippets、items、registries 的发现、搜索、读取。
- `@mcpskill/datapack-adapter`: `data/**` 与 `assets/**` root、namespace、kind、预算化读取和搜索。
- `@mcpskill/java-jdtls-adapter`: JDTLS/Java 环境画像和 LSP operation contract。
- `@mcpskill/jar-source-adapter`: Java sources 解包，以及 mod jar 内 `data/**`、`assets/**`、`.java` 的按需抽取。
- `@mcpskill/service-profile`: 聚合底层能力，输出 harness/prompt 可用的 service profile 和 guidance。

## Prompt Injection
新增内部 prompt fragment：`service_profile`。

它注入的信息包括：
- workspace kind
- detected Minecraft runtime / loader
- Gradle source archives
- Java LSP status
- ProbeJS type status
- datapack namespace/kind
- source-index database count
- route guidance

这让 MCP 在被 agent 使用时更像“小 agent”，先给出可用证据层和行动顺序，而不是暴露大量底层方法让上层自己猜。

## Current Non-Goals
- 不在本阶段启动 JDTLS JSON-RPC session。
- 不在本阶段实现 Mojang manifest + mappings + decompile/remap 的完整 vanilla 生成链。
- 不在本阶段实现远端 release 下载器和 checksum 强制校验。
- 不把用户本地生成的 source pack、source-index、ProbeJS cache、modpack 派生数据提交进仓库。
