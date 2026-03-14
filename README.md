# mc-developing-mcp

> **Minecraft / KubeJS 开发辅助 MCP 服务**
> 为 AI 编程助手（Claude、Cursor、VS Code Copilot 等）提供 Minecraft 源码、KubeJS API 及第三方插件的精准查询能力。

[English Version](.github/READMEEN.md)

---

## 目录

- [这是什么](#这是什么)
- [系统架构说明](#系统架构说明)
- [快速开始](#快速开始)
  - [方式一：下载 Release 包（推荐）](#方式一下载-release-包推荐)
  - [方式二：克隆源码 + 重建数据库](#方式二克隆源码--重建数据库)
- [配置 AI 客户端](#配置-ai-客户端)
- [性能模式配置](#性能模式配置)
- [数据库说明](#数据库说明)
- [支持的第三方库](#支持的第三方库)
- [常见问题](#常见问题)

---

## 这是什么

`mc-developing-mcp` 是一个 [MCP（Model Context Protocol）](https://modelcontextprotocol.io/) 服务器，让 AI 助手能够直接查询：

- **Minecraft Java 源码**：76,000+ 个文件，1,100,000+ 个方法，170,000+ 个类
- **KubeJS API**：事件系统、脚本类型、Forge/NeoForge 事件映射
- **36 个第三方库**：LootJS、PonderJS、EventJS、GeckoJS 等 KubeJS 生态插件
- **官方文档**：320 页结构化文档，支持全文搜索

### 为什么用 SQLite 而不是向量数据库（RAG）？

这是个常见问题。对于 Minecraft 开发场景，SQLite + 索引查询比向量嵌入更合适：

| 查询场景 | SQLite（本项目） | 向量嵌入 |
|---|---|---|
| 按类名/方法名精确查找 | 毫秒级，100% 准确 | 可能有语义漂移 |
| 列出某个类的所有方法 | 单次索引 JOIN | 需要分块重聚合 |
| 110 万个方法建索引 | 轻松处理 | 需要数小时 + GB 级存储 |
| 离线使用，无 API 费用 | ✅ | ❌ |
| 代码结构关系查询 | SQL 天然支持 | 难以表达 |

文档的模糊搜索已通过 **FTS5 全文索引**覆盖，兼顾了精确查询与语义搜索两种需求。

---

## 系统架构说明

```
mc-developing-mcp/
├── mcp_server/
│   └── server.py          # MCP 服务主程序（JSON-RPC over stdio）
├── data/
│   ├── minecraft_docs.sqlite    # 文档数据库（20MB，已包含在仓库中）
│   └── minecraft_sources.sqlite # 源码数据库（1.2GB，需单独下载）
├── docs/
│   └── reference/         # 17 份参考文档（KubeJS、Forge、NeoForge 等）
├── scripts/
│   └── download_release.py  # 一键下载大型 SQLite 数据库的脚本
├── SKILL.md               # AI 使用本服务的查询规则
├── config.json            # 性能配置文件
└── version.json           # 版本号（变更时触发 CI/CD 发布）
```

**数据流**：AI 助手 → MCP 客户端 → `server.py`（stdio）→ SQLite 数据库 → 返回结构化结果

服务器**不需要后台常驻运行**，由 AI 客户端按需启动和管理。

---

## 快速开始

### 前置要求

- Python 3.10+
- 安装依赖：`pip install -r requirements.txt`

---

### 方式一：下载 Release 包（推荐）

这是最简单的方式，Release 包包含完整的预构建数据库。

**第一步：下载并解压**

前往 [Releases 页面](https://github.com/PickAID/mc-developing-mcp/releases/latest) 下载 `mc-developing-mcp-full-vX.X.X.zip`（完整包，含源码数据库）。

解压到你想要的目录，例如：
```
~/tools/mc-developing-mcp/
```

**第二步：安装依赖**

```bash
cd ~/tools/mc-developing-mcp
pip install -r requirements.txt
```

**第三步：配置 AI 客户端**（见下一节）

---

### 方式二：克隆源码 + 重建数据库

适合需要修改源码或重建最新数据库的开发者。

**第一步：克隆仓库**

```bash
git clone https://github.com/PickAID/mc-developing-mcp.git
cd mc-developing-mcp
pip install -r requirements.txt
```

**第二步：下载大型数据库**

`minecraft_sources.sqlite`（1.2GB）不包含在 git 仓库中，需单独下载：

```bash
python scripts/download_release.py
```

此脚本会自动从最新 Release 下载 `minecraft_sources.sqlite` 到 `data/` 目录。

**第三步：（可选）从 Java 源码重建数据库**

如需基于最新 Minecraft 源码重建：

```bash
# 1. 将 Minecraft Java 源码放入 sources/ 目录
# 2. 重建源码索引
python scripts/index_sources.py

# 3. 重建文档数据库
python scripts/fetch_docs.py
python scripts/init_docs_db.py
```

---

## 配置 AI 客户端

在你的 AI 客户端配置文件中添加以下 MCP 服务配置（将路径替换为实际安装路径）：

### Claude Desktop

配置文件路径：
- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mc-developing-mcp": {
      "command": "python3",
      "args": ["/你的路径/mc-developing-mcp/mcp_server/server.py"],
      "env": {
        "MC_MCP_MODE": "balanced"
      }
    }
  }
}
```

### Cursor / VS Code（使用 MCP 插件）

在项目的 `.cursor/mcp.json` 或 VS Code 设置中：

```json
{
  "mcpServers": {
    "mc-developing-mcp": {
      "command": "python3",
      "args": ["/你的路径/mc-developing-mcp/mcp_server/server.py"]
    }
  }
}
```

### OpenCode

```json
{
  "mcp": {
    "servers": {
      "mc-developing-mcp": {
        "command": "python3",
        "args": ["/你的路径/mc-developing-mcp/mcp_server/server.py"],
        "type": "local"
      }
    }
  }
}
```

---

## 性能模式配置

根据你的机器配置选择合适的性能模式，编辑 `config.json` 或设置环境变量。

### 三种预设模式

| 模式 | 适用场景 | 内存占用 | 页缓存 | mmap 大小 |
|---|---|---|---|---|
| `minimal` | 低配机器（<4GB RAM） | ~200MB | 16MB | 128MB |
| `balanced` | 标准开发机（4-8GB RAM） | ~700MB | 128MB | 512MB |
| `performance` | 高端工作站（16GB+ RAM） | ~2.5GB | 512MB | 2GB |

### 方法一：修改 config.json

```json
{
  "mode": "performance"
}
```

### 方法二：设置环境变量

```bash
# 临时生效
MC_MCP_MODE=performance python3 mcp_server/server.py

# 或在 AI 客户端配置的 env 字段中设置
```

### 方法三：精细调节单项参数

```json
{
  "mode": "balanced",
  "sources_cache_kib": -262144,
  "sources_mmap_bytes": 1073741824,
  "find_class_lru": 8192
}
```

各参数说明见 `config.json` 中的注释。

---

## 数据库说明

### minecraft_sources.sqlite（源码库，1.2GB）

| 内容 | 数量 |
|---|---|
| Java 源文件 | 76,525 |
| 类 | 171,662 |
| 方法 | 1,104,762 |
| 字段 | 587,585 |
| 事件 | 6,358 |
| 第三方库 | 36 个 |

此文件**不包含在 git 仓库中**，通过 `scripts/download_release.py` 或从 Release 包获取。

### minecraft_docs.sqlite（文档库，~20MB）

| 内容 | 数量 |
|---|---|
| 文档页面 | 320 |
| 库/版本条目 | 48 |

此文件**已包含在 git 仓库中**，克隆后即可使用。

---

## 支持的第三方库

包含 36 个第三方库，涵盖主流 KubeJS 生态插件：

- **核心 KubeJS 插件**：LootJS、PonderJS、EventJS、GeckoJS、AnimationJS、AdvancementJS、RenderJS
- **实用工具**：KubeJS Additions、MoreJS、ModifyJS、KeyBindJS、FetchJS、FilesJS
- **系统工具**：KubeLoader、KubePackages、KubeUtils、KubeJS Offline、Player Animator

所有库均按版本隔离索引，查询时需指定 Minecraft 版本（1.20.1 / 1.21.1）。

---

## 常见问题

**Q：启动时报 `data/minecraft_sources.sqlite not found`**

```bash
python scripts/download_release.py
```

**Q：想切换到性能模式**

编辑 `config.json`，将 `"mode"` 改为 `"performance"`，或设置环境变量 `MC_MCP_MODE=performance`。

**Q：AI 助手查不到某个方法/类**

1. 确认数据库已下载（`data/minecraft_sources.sqlite` 存在）
2. 检查版本号是否正确（1.20.1 vs 1.21.1）
3. 尝试用类名前缀或包名搜索

**Q：是否需要重建数据库？**

只有在以下情况才需要重建：
- 需要覆盖新版本 Minecraft 源码
- 需要添加新的第三方库

日常使用直接下载 Release 包即可。

---

## License

MIT License — 详见 [LICENSE](LICENSE) 文件。
