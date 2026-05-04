import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimeTaskIntent
} from "@mcpskill/shared-types";

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

  if (matchesAny(normalized, EXTERNAL_MOD_KEYWORDS)) {
    return {
      id: "external_mod_resolution",
      confidence: "high",
      reasons: [
        "request text mentions external mod acquisition or Maven coordinate keywords"
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

  const datapackRequest =
    matchesAny(normalized, DATAPACK_KEYWORDS) || mentionsDataPath(normalized);
  const resourcePackRequest =
    matchesAny(normalized, RESOURCE_PACK_KEYWORDS) ||
    mentionsAssetsPath(normalized);
  const vanillaGeneratedDatapackRequest =
    datapackRequest && mentionsVanillaGeneratedDatapackRequest(normalized);
  const vanillaGeneratedResourcePackRequest =
    resourcePackRequest && mentionsVanillaGeneratedResourcePackRequest(normalized);

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

export function detectHarnessTaskIntentFromSnapshot(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskIntent {
  return detectHarnessTaskIntent(snapshot, requestText);
}

function matchesAny(requestText: string, keywords: string[]): boolean {
  return keywords.some((keyword) => requestText.includes(keyword));
}

function mentionsDataPath(requestText: string): boolean {
  return /\bdata\/[a-z0-9_.-]+\/[a-z0-9_./-]+/.test(requestText);
}

function mentionsAssetsPath(requestText: string): boolean {
  return /\bassets\/[a-z0-9_.-]+\/[a-z0-9_./-]+/.test(requestText);
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
