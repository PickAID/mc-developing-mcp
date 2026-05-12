import type { AgentRuntimeHarnessSnapshot } from "minecraft-developing-mcp-shared-types";

export const CRASH_KEYWORDS = [
  "crash",
  "crashes",
  "crashed",
  "latest.log",
  "debug.log",
  "exception",
  "stacktrace",
  "stack trace",
  "crash-report",
  "crash report",
  "崩溃",
  "报错",
  "异常",
  "堆栈"
];

export const KUBEJS_KEYWORDS = [
  "kubejs",
  "kjs",
  "probejs",
  "server_scripts",
  "startup_scripts",
  "client_scripts",
  "recipe",
  "recipes",
  "脚本",
  "配方"
];

export const DATAPACK_KEYWORDS = [
  "datapack",
  "data pack",
  "pack.mcmeta",
  "worldgen",
  "loot table",
  "loot_table",
  "advancement",
  "predicate",
  "biome",
  "dimension",
  "configured_feature",
  "placed_feature",
  "数据包",
  "世界生成"
];

export const RESOURCE_PACK_KEYWORDS = [
  "resource pack",
  "resource-pack",
  "blockstate",
  "blockstates",
  "block model",
  "item model",
  "model reference",
  "model references",
  "texture",
  "textures",
  "资源包"
];

export const CLIENT_VISUAL_RESOURCE_KEYWORDS = [
  "client ui",
  "client-side ui",
  "screen",
  "screens",
  "menu screen",
  "client menu",
  "block entity renderer",
  "blockentityrenderer",
  "ber",
  "renderer",
  "rendering",
  "connected texture",
  "connected textures",
  "ctm",
  "model registration",
  "model layer",
  "model loader",
  "baked model",
  "dynamic texture",
  "dynamic textures",
  "animated texture",
  "animated material",
  "texture atlas",
  "atlas",
  "sprite",
  "sprites",
  "nine-slice",
  "nine slice",
  "9-slice",
  "sliced sprite",
  "render layer",
  "render pipeline",
  "pipeline state",
  "color handler",
  "gui texture",
  "shader",
  "shaders",
  "post chain",
  "post-processing",
  "post processing",
  "resource reload",
  "block entity sync",
  "mechanical visual",
  "machine visual",
  "blockstate registration",
  "asset registration",
  "register model",
  "register renderer",
  "registry wiring",
  "client init",
  "client initializer",
  "renderer binding",
  "renderer bindings",
  "client setup",
  "客户端",
  "界面九宫格",
  "九宫格",
  "渲染器",
  "渲染",
  "渲染管线",
  "着色器",
  "后处理",
  "模型注册",
  "复杂模型",
  "方块模型",
  "自定义模型",
  "模型加载",
  "显示不出来",
  "看不见",
  "动态材质",
  "动态贴图",
  "动画材质",
  "机械视觉",
  "机器视觉",
  "发光",
  "转动",
  "界面方块",
  "机器方块"
];

export const JAVA_DIAGNOSTIC_KEYWORDS = [
  "compile error",
  "compilation error",
  "cannot resolve",
  "cannot be resolved",
  "unresolved symbol",
  "unresolved import",
  "missing symbol",
  "diagnostic",
  "diagnostics",
  "javac",
  "type mismatch",
  "method undefined",
  "编译",
  "诊断",
  "找不到符号",
  "无法解析"
];

export const VERSION_CHANGE_KEYWORDS = [
  "version change",
  "version changes",
  "technical change",
  "technical changes",
  "changelog",
  "change log",
  "migration",
  "migrate",
  "upgrade",
  "porting",
  "primer",
  "primers",
  "neoforged primer",
  "neoforged primers",
  "neoforge primer",
  "neoforge primers",
  "misode changelog",
  "misode version",
  "technical-changes",
  "版本变化",
  "版本变更",
  "迁移",
  "升级",
  "移植",
  "更新日志",
  "变更日志"
];

export const EXTERNAL_MOD_KEYWORDS = [
  "modrinth",
  "curseforge",
  "cursemaven",
  "curse.maven",
  "maven.modrinth",
  "modimplementation",
  "modcompileonly",
  "modruntimeonly",
  "modlocalruntime",
  "fg.deobf",
  "外部模组",
  "外部mod",
  "模组坐标",
  "依赖坐标"
];

const WORKSPACE_PREPARATION_KEYWORDS = [
  "prepare",
  "preparation",
  "initialize",
  "initialise",
  "init",
  "setup",
  "bootstrap",
  "prewarm",
  "cache",
  "caches",
  "bundle",
  "bundles",
  "index",
  "source cache",
  "dependency source",
  "dependency sources",
  "external mod code",
  "inspect later",
  "use later",
  "准备",
  "初始化",
  "预热",
  "缓存",
  "打包",
  "索引",
  "源码缓存",
  "依赖源码",
  "外部模组源码",
  "外部mod源码",
  "之后能看",
  "后续查看"
];

export const HOTAI_PATCH_WORKFLOW_KEYWORDS = [
  "hotai",
  "badiff",
  ".badiff",
  "bytecode patch",
  "bytecode patches",
  "class patch",
  "class patches",
  "hotai/before_mixin",
  "before_mixin",
  "创可贴补丁",
  "创可贴式补丁",
  "绷带补丁"
];

export function matchesAny(requestText: string, keywords: string[]): boolean {
  return keywords.some((keyword) => requestText.includes(keyword));
}

export function hasHotaiPatchWorkflowEvidence(
  snapshot: AgentRuntimeHarnessSnapshot
): boolean {
  return (
    snapshot.facts.hasModArchives ||
    snapshot.facts.hasGradle ||
    snapshot.facts.hasJavaSource
  );
}

export function matchesWorkspacePreparationIntent(
  requestText: string,
  snapshot: AgentRuntimeHarnessSnapshot
): boolean {
  if (
    mentionsModArchiveInventoryRequest(requestText) &&
    !mentionsPrewarmAction(requestText)
  ) {
    return false;
  }
  if (mentionsConcreteJavaSourceRead(requestText)) {
    return false;
  }
  if (!matchesAny(requestText, WORKSPACE_PREPARATION_KEYWORDS)) {
    return false;
  }
  if (mentionsOnlyClientLifecycleSetup(requestText)) {
    return false;
  }
  if (mentionsDocsLookupIntent(requestText) && !mentionsExplicitPreparationAction(requestText)) {
    return false;
  }

  return (
    snapshot.facts.hasGradle ||
    snapshot.facts.hasJavaSource ||
    snapshot.facts.hasKubeJS ||
    snapshot.facts.hasProbeJS ||
    snapshot.facts.hasModArchives ||
    snapshot.facts.hasDatapack ||
    snapshot.facts.hasResourcePack
  );
}

function mentionsModArchiveInventoryRequest(requestText: string): boolean {
  return (
    /\b(inventory|index|summary|清单|索引|概览)\b/i.test(requestText) &&
    /\b(mod|mods|jar|jars|jarjar|archive|archives)\b/i.test(requestText)
  );
}

function mentionsConcreteJavaSourceRead(requestText: string): boolean {
  return (
    /\b(?:open|read|show|查看|读取|打开)\b/i.test(
      requestText
    ) &&
    /\b(?:source|sources|java|gradle cache|gradle|源码|源代码)\b/i.test(
      requestText
    )
  );
}

function mentionsDocsLookupIntent(requestText: string): boolean {
  return /docs?|documentation|guide|guidance|reference|explain|文档|说明|参考/u.test(
    requestText
  );
}

function mentionsOnlyClientLifecycleSetup(requestText: string): boolean {
  return (
    (/\bclient\s+(?:init|initializer|setup)\b/u.test(requestText) ||
      /客户端初始化/u.test(requestText)) &&
    !/\b(?:prepare|preparation|initialize|initialise|bootstrap|prewarm|cache|caches|bundle|bundles|source cache|dependency sources?)\b|准备|初始化|预热|缓存|打包/u.test(
      requestText.replace(/客户端初始化/gu, "客户端生命周期")
    )
  );
}

function mentionsExplicitPreparationAction(requestText: string): boolean {
  return /prepare|preparation|initialize|initialise|\binit\b|setup|bootstrap|prewarm|cache|caches|bundle|bundles|准备|初始化|预热|缓存|打包/u.test(
    requestText
  );
}

function mentionsPrewarmAction(requestText: string): boolean {
  return /\bprewarm\b|预热/u.test(requestText);
}

export function mentionsDataPath(requestText: string): boolean {
  return /\bdata\/[a-z0-9_.-]+\/[a-z0-9_./-]+/.test(requestText);
}

export function mentionsAssetsPath(requestText: string): boolean {
  return /\bassets\/[a-z0-9_.-]+\/[a-z0-9_./-]+/.test(requestText);
}

export function mentionsClientVisualResourceContext(requestText: string): boolean {
  return /\b(?:client|screen|menu|render|renderer|rendering|model|blockstate|registry|registr(?:y|ation)|asset)\b/.test(requestText);
}

export function hasClientVisualResourceEvidence(
  snapshot: AgentRuntimeHarnessSnapshot
): boolean {
  return (
    snapshot.facts.hasJavaSource ||
    snapshot.facts.hasGradle ||
    snapshot.facts.hasKubeJS ||
    snapshot.facts.hasProbeJS ||
    snapshot.facts.hasDatapack ||
    snapshot.facts.datapackRootCount > 0 ||
    snapshot.facts.hasResourcePack ||
    snapshot.facts.resourcePackRootCount > 0 ||
    snapshot.facts.hasModArchives
  );
}

export function mentionsVanillaGeneratedDatapackRequest(
  requestText: string
): boolean {
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(requestText) &&
    /\bminecraft:[a-z0-9_.\/-]+\b|data\/minecraft\//.test(requestText)
  );
}

export function mentionsVanillaGeneratedResourcePackRequest(
  requestText: string
): boolean {
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(requestText) &&
    /assets\/minecraft\//.test(requestText)
  );
}

export function mentionsVanillaGenerationTargetRequest(
  requestText: string
): boolean {
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(requestText) &&
    /\b(?:local-generation|local generation|generate locally|generation target|generation targets|source-pack|source pack)\b|本地生成|生成目标/.test(
      requestText
    )
  );
}
