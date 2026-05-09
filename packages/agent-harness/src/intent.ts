import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimeTaskIntent
} from "minecraft-developing-mcp-shared-types";

const CRASH_KEYWORDS = [
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

const KUBEJS_KEYWORDS = [
  "kubejs",
  "kjs",
  "server_scripts",
  "startup_scripts",
  "client_scripts",
  "recipe",
  "recipes",
  "脚本",
  "配方"
];

const DATAPACK_KEYWORDS = [
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

const RESOURCE_PACK_KEYWORDS = [
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

const CLIENT_VISUAL_RESOURCE_KEYWORDS = [
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

const JAVA_DIAGNOSTIC_KEYWORDS = [
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

const EXTERNAL_MOD_KEYWORDS = [
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

const HOTAI_PATCH_WORKFLOW_KEYWORDS = [
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

export function detectHarnessTaskIntent(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskIntent {
  if (!requestText || requestText.trim() === "") {
    return {
      id: "workspace_default",
      confidence: "low",
      reasons: ["request text is unavailable"]
    };
  }

  const normalized = requestText.toLowerCase();
  const datapackRequest =
    matchesAny(normalized, DATAPACK_KEYWORDS) || mentionsDataPath(normalized);
  const resourcePackRequest =
    matchesAny(normalized, RESOURCE_PACK_KEYWORDS) ||
    mentionsAssetsPath(normalized);
  const clientVisualResourceRequest =
    matchesAny(normalized, CLIENT_VISUAL_RESOURCE_KEYWORDS) ||
    (resourcePackRequest && mentionsClientVisualResourceContext(normalized));
  const vanillaGeneratedDatapackRequest =
    datapackRequest && mentionsVanillaGeneratedDatapackRequest(normalized);
  const vanillaGeneratedResourcePackRequest =
    resourcePackRequest && mentionsVanillaGeneratedResourcePackRequest(normalized);
  const vanillaGenerationTargetRequest =
    mentionsVanillaGenerationTargetRequest(normalized);

  if (
    matchesAny(normalized, HOTAI_PATCH_WORKFLOW_KEYWORDS) &&
    hasHotaiPatchWorkflowEvidence(snapshot)
  ) {
    return {
      id: "hotai_patch_workflow",
      confidence: "high",
      reasons: [
        "request text mentions Hotai, badiff, bytecode patch, class patch, or Hotai patch layout keywords",
        "workspace snapshot exposes patch target evidence routes"
      ]
    };
  }

  if (matchesWorkspacePreparationIntent(normalized, snapshot)) {
    return {
      id: "workspace_preparation",
      confidence: "high",
      reasons: [
        "request text asks to prepare, initialize, cache, bundle, or index workspace evidence",
        "workspace snapshot exposes local evidence routes that can be prepared progressively"
      ]
    };
  }

  if (matchesAny(normalized, CRASH_KEYWORDS) && snapshot.facts.logPathCount > 0) {
    return {
      id: "crash_triage",
      confidence: "high",
      reasons: [
        "request text mentions crash or log-triage keywords",
        "workspace snapshot exposes log files for crash triage"
      ]
    };
  }

  if (
    clientVisualResourceRequest &&
    !vanillaGeneratedResourcePackRequest &&
    hasClientVisualResourceEvidence(snapshot)
  ) {
    return {
      id: "client_visual_resources",
      confidence: "high",
      reasons: [
        "request text mentions client visual, rendering, model, blockstate, asset, or registry wiring keywords",
        "workspace snapshot exposes source, asset/datapack, or mod archive evidence"
      ]
    };
  }

  if (
    matchesAny(normalized, JAVA_DIAGNOSTIC_KEYWORDS) &&
    (snapshot.facts.hasJavaSource || snapshot.facts.hasGradle)
  ) {
    return {
      id: "java_diagnostics",
      confidence: "high",
      reasons: [
        "request text mentions Java compile or diagnostic keywords",
        "workspace snapshot exposes Java source or Gradle signals"
      ]
    };
  }

  if (vanillaGenerationTargetRequest) {
    return {
      id: "datapack_lookup",
      confidence: "high",
      reasons: [
        "request text asks for official vanilla local generation targets",
        "vanilla generation targets are exposed through source.bundle without downloading artifacts"
      ]
    };
  }

  if (matchesAny(normalized, EXTERNAL_MOD_KEYWORDS)) {
    return {
      id: "external_mod_resolution",
      confidence: "high",
      reasons: [
        "request text mentions external mod acquisition or Maven coordinate keywords"
      ]
    };
  }

  if (
    matchesAny(normalized, KUBEJS_KEYWORDS) &&
    (snapshot.facts.hasKubeJS || snapshot.facts.hasProbeJS)
  ) {
    return {
      id: "kubejs_authoring",
      confidence: "high",
      reasons: [
        "request text mentions KubeJS scripting keywords",
        "workspace snapshot exposes KubeJS or ProbeJS signals"
      ]
    };
  }

  if (
    resourcePackRequest &&
    (
      snapshot.facts.hasDatapack ||
      snapshot.facts.datapackRootCount > 0 ||
      vanillaGeneratedResourcePackRequest
    )
  ) {
    return {
      id: "resource_pack_lookup",
      confidence: "high",
      reasons: vanillaGeneratedResourcePackRequest
        ? [
            "request text mentions vanilla resource-pack asset evidence",
            "vanilla assets content can be resolved from generated official packages"
          ]
        : [
            "request text mentions resource-pack asset keywords or assets path",
            "workspace snapshot exposes resource-pack asset content"
          ]
    };
  }

  if (
    datapackRequest &&
    (
      snapshot.facts.hasDatapack ||
      snapshot.facts.datapackRootCount > 0 ||
      vanillaGeneratedDatapackRequest
    )
  ) {
    return {
      id: "datapack_lookup",
      confidence: "high",
      reasons: vanillaGeneratedDatapackRequest
        ? [
            "request text mentions vanilla datapack evidence",
            "vanilla data content can be resolved from generated official packages"
          ]
        : [
            "request text mentions datapack or worldgen keywords",
            "workspace snapshot exposes datapack content"
          ]
    };
  }

  return {
    id: "workspace_default",
    confidence: "low",
    reasons: ["request text does not match a specialized harness intent"]
  };
}

function hasHotaiPatchWorkflowEvidence(
  snapshot: AgentRuntimeHarnessSnapshot
): boolean {
  return (
    snapshot.facts.hasModArchives ||
    snapshot.facts.hasGradle ||
    snapshot.facts.hasJavaSource
  );
}

export function detectHarnessTaskIntentFromSnapshot(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskIntent {
  return detectHarnessTaskIntent(snapshot, requestText);
}

function matchesAny(requestText: string, keywords: string[]): boolean {
  return keywords.some((keyword) => requestText.includes(keyword));
}

function matchesWorkspacePreparationIntent(
  requestText: string,
  snapshot: AgentRuntimeHarnessSnapshot
): boolean {
  if (
    mentionsModArchiveInventoryRequest(requestText) &&
    !mentionsPrewarmAction(requestText)
  ) {
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

function mentionsDataPath(requestText: string): boolean {
  return /\bdata\/[a-z0-9_.-]+\/[a-z0-9_./-]+/.test(requestText);
}

function mentionsAssetsPath(requestText: string): boolean {
  return /\bassets\/[a-z0-9_.-]+\/[a-z0-9_./-]+/.test(requestText);
}

function mentionsClientVisualResourceContext(requestText: string): boolean {
  return /\b(?:client|screen|menu|render|renderer|rendering|model|blockstate|registry|registr(?:y|ation)|asset)\b/.test(requestText);
}

function hasClientVisualResourceEvidence(
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

function mentionsVanillaGeneratedDatapackRequest(requestText: string): boolean {
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(requestText) &&
    /\bminecraft:[a-z0-9_.\/-]+\b|data\/minecraft\//.test(requestText)
  );
}

function mentionsVanillaGeneratedResourcePackRequest(
  requestText: string
): boolean {
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(requestText) &&
    /assets\/minecraft\//.test(requestText)
  );
}

function mentionsVanillaGenerationTargetRequest(requestText: string): boolean {
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(requestText) &&
    /\b(?:local-generation|local generation|generate locally|generation target|generation targets|source-pack|source pack)\b|本地生成|生成目标/.test(
      requestText
    )
  );
}
