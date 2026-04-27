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
    matchesAny(normalized, DATAPACK_KEYWORDS) &&
    (snapshot.facts.hasDatapack || snapshot.facts.datapackRootCount > 0)
  ) {
    return {
      id: "datapack_lookup",
      confidence: "high",
      reasons: [
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
