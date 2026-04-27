# Gradle 与 LSP 生态实现分析

Author: m1hono
Date: 2026-04-06
Scope: `SKillUpdate` 在进入真实 Gradle/LSP 集成前的分析阶段结论

## 目的

这份文档回答三个问题：

1. IntelliJ IDEA、Gradle Tooling API、JDT LS、VS Code Java 这一类成熟系统到底是怎么做的。
2. Java LSP 能不能单独解决 Gradle 内容、外部依赖源码、JAR 导航这些问题。
3. 对当前 `SKillUpdate` 来说，最好的下一步架构应该是什么。

这不是实现汇报。
这是后续实现前的技术判断依据。

## 当前仓库状态

结合当前仓库代码，`SKillUpdate` 已经完成了“源码获取层”的一大半，但“导入后的项目模型层”和“Java 语义层”还没有真正落地。

当前已具备：

  已能从 `build.gradle` / `build.gradle.kts` 解析依赖，并映射到本地 Gradle cache。
  已能从真实 `sources.jar` 返回源码片段。
  已有基于 `javap` 的反编译兜底。
  已能把 Gradle、KubeJS、Probe、日志、依赖产物纳入检测结果。

当前仍明显缺失：

  仍只是生命周期和函数注入壳，不是真正的 Java LSP 连接器。
  当前 Gradle 模型还很浅，只覆盖 build files、source roots、dependency artifacts。
  还不够表达真实 Java 语义层需要的工作空间状态、class path 语境和 richer result。

结论很直接：

- 现在已经不是“铺壳”了。
- 但也还没有到 IDEA / JDT LS 那种“先导入项目模型，再用语义服务工作”的阶段。

## 外部方案结论

以下结论来自官方文档和官方源码。
其中带“推断”的地方，是我根据官方实现和当前仓库结构做出的工程判断。

## IntelliJ IDEA 是怎么做的

### 1. 先做 Gradle project resolve，不是先做语言服务

IntelliJ 的官方 Gradle 导入代码 `GradleProjectResolver` 明确使用 `ProjectConnection`，构造 `GradleModelFetchAction`，然后通过 Tooling API 拉取模型，再把模型落入自己的项目结构。

这说明 IntelliJ 的顺序是：

1. 连接 Gradle
2. 拉取项目模型和扩展模型
3. 组装 IDEA 自己的 module / source set / library / composite build 结构
4. 然后再让导航、索引、补全等能力建立在这个模型上

不是“LSP 直接理解 build.gradle”。

### 2. 它把 source set、included build、buildSrc 都当作项目模型的一部分

`GradleProjectResolver` 和 `GradleProjectResolverUtil` 里可以看到：

- 读取 `IdeaProject` / `IdeaModule`
- 处理 source set
- 处理 composite build
- 处理 `buildSrc`
- 将库依赖和模块依赖一起并入项目数据

这和你前面强调的“modpack / modding 场景里不能只看当前项目源码”是完全一致的。

成熟方案不会只把 Gradle 当成一个依赖文本文件。
它会把 Gradle build 产出的整个工程结构当成模型。

### 3. 它会主动给依赖附加 source / javadoc

`GradleProjectResolverUtil.attachSourcesAndJavadocFromGradleCacheIfNeeded(...)` 明确会尝试从 Gradle cache 或相邻位置把 source 和 javadoc 附到依赖库上。

这点很关键。

因为这说明对成熟工具来说：

- `jar` 不是终点
- `sources.jar` 才是第一优先级
- decompile 只是最后兜底

这和我们现在已经做出来的 `sourcejar -> decompile` 顺序完全一致，方向是对的。

### 4. 没有源码时，IDEA 默认展示反编译结果

IntelliJ 官方文档明确说明：

- 默认会为 compiled files 展示 decompiled code
- 需要时还能打开 bytecode viewer

这说明成熟实现的真实优先级是：

1. attached source
2. decompiled source-like view
3. bytecode

所以我们当前 `sourcejar + javap fallback` 不是错误方向，只是还没进化到更强的 decompiler。

### 5. 对当前项目的启发

对 `SKillUpdate` 的直接启发是：

- 不能把 LSP 作为第一块实现
- 必须先有更强的 Gradle workspace model
- source attachment 必须成为一等公民
- buildSrc / composite build / source set 未来都应纳入模型

## Gradle Tooling API 是怎么做的

### 1. 它本来就是给 IDE / CI / 外部工具嵌入用的

Gradle 官方文档直接写明：

- Tooling API 是给 IDE、CI、其他 UI 作者使用的嵌入式接口
- IntelliJ IDEA 和 Eclipse Buildship 都使用它来导入项目和执行任务

这不是旁路能力。
这就是官方给 IDE 集成准备的主路。

### 2. Tooling API 能做什么

从官方文档和 Javadoc 看，`ProjectConnection` 可以：

- `model(...)` 获取标准模型
- `action(...)` 执行 build action
- 查询 `IdeaProject`
- 查询 `IdeaModule`
- 查询依赖、content roots、compiler output

`IdeaSingleEntryLibraryDependency` 还直接提供：

- binary file
- source file
- javadoc file

这说明如果我们想做到“像 IDE 一样可靠”，Gradle 侧最靠谱的方式不是自己在 Go 里持续硬解析各种构建脚本细节，而是走官方 Tooling API。

### 3. Tooling API 不能单独替代语言服务

它擅长的是：

- 工程结构
- 构建信息
- 依赖与 classpath
- source / javadoc 附件

它不擅长的是：

- 定义跳转
- 引用查询
- 类型层级
- 诊断
- 编译器级语义分析

所以 Tooling API 很强，但它不是 Java 语义引擎。
它解决的是“项目模型”问题，不是“代码语义”问题。

### 4. 对当前项目的启发

这部分的结论很硬：

- Gradle 导入层最好用 JVM sidecar + Tooling API 做
- 不建议在 Go 里继续把它扩成“伪 Tooling API”
- 当前 file/cache 方案仍然有价值，但更适合做 fallback、cold-start、无 JVM 时降级路径

## JDT LS / VS Code Java 是怎么做的

### 1. JDT LS 自己就说明了它依赖 Buildship 提供 Gradle 支持

JDT LS 官方 README 直接写明，它基于：

- Eclipse JDT
- M2Eclipse
- Buildship

其中 Buildship 提供的就是 Gradle support。

所以 JDT LS 的 Gradle 能力并不是“LSP 本体天然理解 Gradle”，而是“先有 Eclipse 体系下的 Gradle 项目导入，再由语言服务工作”。

### 2. JDT LS 需要工作空间数据目录

JDT LS 官方 README 还明确要求 `-data /path/to/data`。

这意味着：

- Java 语言服务不是一次性 stateless 查询
- 它需要 workspace cache / metadata / index
- 它天然偏向“导入后持续服务”的模式

这点和 modpack / 大量外部 jar / 多模块 Gradle 项目非常相关。
如果没有一层稳定的 workspace state，LSP 很容易又慢又不准。

### 3. VS Code Java 的行为也证明了这一点

VS Code Java 官方扩展提供的命令里包括：

- `Java: Import Java Projects into Workspace`
- `Java: Reload Projects`
- `Java: Attach Source`
- `Java: Clean Java Language Server Workspace`

这已经把真实架构暴露得很明显了：

- 先导入
- 维护 workspace
- classpath 改了要 reload
- 二进制类需要 attach source

它不是一个只靠 `textDocument/definition` 就能自动搞定所有 Gradle/JAR 问题的系统。

### 4. VS Code 的“Project Manager for Java”单独支持 referencedLibraries 与 source 映射

官方 `Project Manager for Java` README 明确支持：

- 直接纳入任意 jar
- glob 扫 jar
- 为 jar 显式绑定 source jar

这对你的 modpack / 外部 mods / 非标准 Gradle 工作区场景特别重要。

因为这等于官方也承认：

- 不是所有 Java 场景都能依赖标准 Gradle/Maven import
- 对 unmanaged jar，也需要单独的 library 管理层

### 5. 对当前项目的启发

这部分最重要的结论是：

- LSP 不是第一层
- LSP 上面必须有 workspace import / classpath 管理
- 对 unmanaged jars，还需要额外的 artifact intelligence

这和你前面强调的“崩溃排查时，agent 不要去找不存在的项目源码，而是应该直接看 jar、gradle、probe、日志”完全一致。

## 直接回答核心问题

## 问题一：LSP 能不能单独吃下 Gradle 内容

不能。

更准确地说：

- “裸 LSP”不能
- “建立在导入后的项目模型之上的 Java LSP”可以处理其中一部分

成熟系统的真实顺序都是：

1. 导入项目模型
2. 建立 classpath / source attachment / workspace state
3. 再做 definition / symbol / diagnostics / references

所以如果只做 LSP 接口，不做模型导入层，最后效果会很差。

## 问题二：能不能实现包含 Gradle 内容的完整支持

可以。

但正确实现方式不是“让 LSP 直接解析所有 Gradle”。
正确方式是：

- Gradle importer / model layer
- Java semantic layer
- jar/source/decompile fallback layer
- scenario-aware planner

## 问题三：对 modpack、外部 mods、崩溃排查这种场景，最佳路径是什么

最佳路径不是统一走 LSP。

而是按场景分流：

- 项目本地 Java 符号问题
  优先 `Gradle model -> LSP`
- Gradle 管理依赖源码
  优先 `Gradle model -> sources.jar`
- modpack 外部 jar / crash triage
  优先 `logs -> jar ownership -> sourcejar -> decompile`
- KubeJS / Probe / d.ts
  优先 `probe / kubejs roots / snippets / d.ts`
- datapack
  优先 `datapack roots / generated resources / registry context`

这就是为什么 routing pipeline 仍然必须是核心。

## 对 `SKillUpdate` 的最佳架构建议

## 建议一：保持 Go 作为总控，不要重写成纯 Java

纯 Java 不是这里的最佳答案。

原因不是 Java 不强。
而是这个项目同时要做：

- MCP transport
- 多路路由
- jar/source/decompile
- Probe / KubeJS / datapack
- modpack 场景识别
- 批量检索与 token 预算

这些 orchestration、批量规划、缓存策略、MCP tool 设计，Go 很适合继续做。

## 建议二：Gradle 与 Java 语义层采用 JVM sidecar，而不是纯 Go 重造

最优方案是混合架构：

- Go 主进程
  负责路由、缓存、批量检索、MCP 暴露、性能预算、降级逻辑
- Gradle JVM sidecar
  负责 Tooling API 导入、workspace model 导出、必要时 build action
- JDT LS sidecar
  负责 definition、symbol、references、diagnostics 等 Java 语义能力

这是我对“最佳”的明确建议。

不是因为它最省事。
而是因为它最接近成熟生态的真实做法，同时能保住你要求的可维护性和性能边界。

## 建议三：LSP 作为可选增强层，不是基础可用层

必须保证：

- 没有 LSP 时系统仍可工作
- 没有数据库时系统仍可工作
- 没有 corpora 时系统仍可工作

但在这些条件下：

- sourcejar
- decompile
- gradle cache
- probe
- datapack roots
- logs

都仍然要能形成完整的检索链。

这和你一直强调的“数据库完全可选”“MCP 自己就能查”“不要浪费 token 在错误路径上”是完全一致的。

## 建议四：Gradle model 要升级成真正的 workspace model

当前 `GradleWorkspaceModel` 太浅。
下一版至少应该覆盖：

- subprojects
- source sets
- generated source roots
- resource roots
- compiler output
- classpath entries
- dependency ownership index
- source attachment map
- `buildSrc` 摘要
- included builds / composite builds 摘要

只有这样，LSP、sourcejar、jar ownership、planner 才能共享同一份事实基础。

## 建议五：planner 必须明确把 Java LSP 和 artifact intelligence 分开

我建议未来路由层明确分成两类权威：

- Java project symbol authority
  由 LSP 提供
- external artifact authority
  由 Gradle model + sourcejar + jar scan + decompile 提供

这样才能避免一种很常见的错误：

- 明明是外部 mod crash
- 却让 agent 一直在工作区源码里乱找

这正是你想解决的核心痛点。

## 推荐的下一实现切片

如果按“效果最大、风险可控、和现有代码最兼容”的顺序，我建议下一步按这个顺序做：

1. 强化 `GradleWorkspaceModel`
2. 引入 JVM sidecar，真实导出 Gradle workspace model
3. 将 `workspace/lsp` 从壳替换成 JDT LS manager
4. 在 routing pipeline 中加入 LSP 优先级规则
5. 为真实环境再次导出方法返回值到 Markdown / JSON

## 不建议的路线

以下路线我不推荐：

- 直接把当前仓库重写成纯 Java
- 让所有查询一律先走 LSP
- 继续只靠静态解析 `build.gradle` 模拟完整 Gradle 模型
- 让数据库或 corpora 成为必须条件
- 把 KubeJS / datapack / modpack crash triage 都塞进同一条 Java-first 路由

## 结论

这一步分析后的最重要结论只有一句：

`SKillUpdate` 最优路线不是“纯 Go 继续补 heuristics”，也不是“LSP 一把梭”，而是“Go 做总控 + Gradle JVM importer + JDT LS sidecar + sourcejar/decompile/probe/datapack/logs 组成分层路由系统”。`

如果要尽可能接近 IDEA 和 VS Code Java 的成熟度，同时又保住 modpack / KubeJS / datapack / 崩溃排查这些 Minecraft 特有场景，这条路最稳。

## 官方来源

- IntelliJ IDEA Gradle 项目文档:
  https://www.jetbrains.com/help/idea/work-with-gradle-projects.html
- IntelliJ IDEA Gradle 工具窗口文档:
  https://www.jetbrains.com/help/idea/jetgradle-tool-window.html
- IntelliJ IDEA 字节码与反编译文档:
  https://www.jetbrains.com/help/idea/bytecode-viewer.html
- IntelliJ IDEA Gradle 依赖分析文档:
  https://www.jetbrains.com/help/idea/work-with-gradle-dependency-diagram.html
- IntelliJ Gradle 导入源码:
  https://github.com/JetBrains/intellij-community/blob/master/plugins/gradle/src/org/jetbrains/plugins/gradle/service/project/GradleProjectResolver.java
- IntelliJ Gradle 依赖与 sources 附加源码:
  https://github.com/JetBrains/intellij-community/blob/master/plugins/gradle/src/org/jetbrains/plugins/gradle/service/project/GradleProjectResolverUtil.java
- IntelliJ class stub / decompiler 扩展入口源码:
  https://github.com/JetBrains/intellij-community/blob/master/java/java-psi-impl/src/com/intellij/psi/impl/compiled/ClassFileStubBuilder.java
- Gradle Tooling API 官方文档:
  https://docs.gradle.org/current/userguide/tooling_api.html
- Gradle `ProjectConnection` Javadoc 源码:
  https://github.com/gradle/gradle/blob/master/platforms/ide/tooling-api/src/main/java/org/gradle/tooling/ProjectConnection.java
- Gradle `IdeaProject` Javadoc 源码:
  https://github.com/gradle/gradle/blob/master/platforms/ide/tooling-api/src/main/java/org/gradle/tooling/model/idea/IdeaProject.java
- Gradle `IdeaModule` Javadoc 源码:
  https://github.com/gradle/gradle/blob/master/platforms/ide/tooling-api/src/main/java/org/gradle/tooling/model/idea/IdeaModule.java
- Gradle `IdeaSingleEntryLibraryDependency` Javadoc 源码:
  https://github.com/gradle/gradle/blob/master/platforms/ide/tooling-api/src/main/java/org/gradle/tooling/model/idea/IdeaSingleEntryLibraryDependency.java
- Eclipse JDT Language Server 官方 README:
  https://github.com/eclipse-jdtls/eclipse.jdt.ls
- VS Code Java 官方扩展 README:
  https://github.com/redhat-developer/vscode-java
- VS Code Project Manager for Java 官方 README:
  https://github.com/microsoft/vscode-java-dependency
