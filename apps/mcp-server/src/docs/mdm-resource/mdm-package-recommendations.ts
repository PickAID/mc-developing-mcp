import { join } from "node:path";

import type {
  MdmResourcePackageStatus,
  MdmResourceStatusEntry
} from "@mcpskill/resource-registry";

import type { MdmResourceStatusContext } from "./mdm-resource-status.js";

export type MdmPackageRecommendationPriority = "high" | "medium" | "low";

export interface MdmPackageRecommendation {
  packageId: string;
  status: MdmResourcePackageStatus;
  priority: MdmPackageRecommendationPriority;
  matchedSignals: string[];
  reason: string;
  mdmReleaseInstall?: {
    packageId: string;
    downloadPolicy: "disabled";
    manifestPath?: string;
  };
}

export interface MdmPackageRecommendations {
  policy: "recommend_before_download";
  status: "available" | "unconfigured" | "unavailable";
  suggestions: MdmPackageRecommendation[];
  message: string;
}

export interface BuildMdmPackageRecommendationsInput {
  requestText: string;
  mdmResources: MdmResourceStatusContext;
  limit?: number;
}

export function buildMdmPackageRecommendations(
  input: BuildMdmPackageRecommendationsInput
): MdmPackageRecommendations {
  if (input.mdmResources.status !== "available") {
    return {
      policy: "recommend_before_download",
      status: input.mdmResources.status,
      suggestions: [],
      message: input.mdmResources.message
    };
  }

  const signals = detectRequestSignals(input.requestText);
  const suggestions = (input.mdmResources.summary?.packages ?? [])
    .map((resourcePackage) =>
      scorePackage({
        resourcePackage,
        signals,
        registryRoot: input.mdmResources.registryRoot
      })
    )
    .filter((suggestion): suggestion is ScoredRecommendation => {
      return suggestion !== undefined && suggestion.score > 0;
    })
    .sort(compareRecommendations)
    .slice(0, input.limit ?? 5)
    .map(({ score: _score, ...suggestion }) => suggestion);

  return {
    policy: "recommend_before_download",
    status: "available",
    suggestions,
    message:
      suggestions.length > 0
        ? "MDM packages are recommendations only; use downloadPolicy=allowed only after explicit confirmation."
        : "No MDM package matched the current request strongly enough."
  };
}

function scorePackage(input: {
  resourcePackage: MdmResourceStatusEntry;
  signals: Set<RequestSignal>;
  registryRoot?: string;
}): ScoredRecommendation | undefined {
  const matchedSignals = matchPackageSignals(input.resourcePackage, input.signals);
  if (matchedSignals.length === 0) {
    return undefined;
  }

  const statusWeight = input.resourcePackage.status === "ready" ? -1 : 1;
  const score = matchedSignals.length * 10 + statusWeight;
  const priority = resolvePriority({
    score,
    status: input.resourcePackage.status,
    matchedSignals
  });

  return {
    packageId: input.resourcePackage.packageId,
    status: input.resourcePackage.status,
    priority,
    matchedSignals,
    reason: buildReason(input.resourcePackage, matchedSignals),
    mdmReleaseInstall:
      input.resourcePackage.status === "ready"
        ? undefined
        : buildInstallHint(input.resourcePackage.packageId, input.registryRoot),
    score
  };
}

function detectRequestSignals(requestText: string): Set<RequestSignal> {
  const normalized = requestText.toLowerCase();
  const signals = new Set<RequestSignal>();

  addSignal(signals, normalized, "kubejs", /kubejs|probejs|forgeevents|nativeevents|startup_events|serverevents|clientevents|global\./u);
  addSignal(signals, normalized, "datapack", /datapack|data pack|recipe|loot|advancement|predicate|tag|function|registry|数据包|配方|战利品|标签/u);
  addSignal(signals, normalized, "resourcepack", /resourcepack|resource pack|assets|model|blockstate|texture|atlas|lang|sound|资源包|模型|纹理/u);
  addSignal(signals, normalized, "client-visual", /client visual|\bgui\b|\bui\b|render|renderer|shader|screen|nine|nine-slice|视觉|渲染|界面/u);
  addSignal(signals, normalized, "mappings", /mapping|mapped|remap|yarn|parchment|mojmap|official name|obfuscated|mixin target|映射|混淆/u);
  if (signals.size === 0) {
    addSignal(signals, normalized, "docs", /docs|documentation|guide|guidance|explain|参考|文档|说明/u);
  }

  return signals;
}

function addSignal(
  signals: Set<RequestSignal>,
  text: string,
  signal: RequestSignal,
  pattern: RegExp
): void {
  if (pattern.test(text)) {
    signals.add(signal);
  }
}

function matchPackageSignals(
  resourcePackage: MdmResourceStatusEntry,
  signals: Set<RequestSignal>
): RequestSignal[] {
  const searchable = [
    resourcePackage.packageId,
    resourcePackage.metadata?.installTier,
    resourcePackage.metadata?.storageKind
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [...signals].filter((signal) => {
    if (signal === "docs") {
      return /docs|guidance|sqlite|jsonl/u.test(searchable);
    }

    return searchable.includes(signal);
  });
}

function resolvePriority(input: {
  score: number;
  status: MdmResourcePackageStatus;
  matchedSignals: RequestSignal[];
}): MdmPackageRecommendationPriority {
  const { score, status, matchedSignals } = input;

  if (matchedSignals.includes("kubejs") || score >= 20) {
    return "high";
  }
  if (score >= 10) {
    return "medium";
  }

  return "low";
}

function buildReason(
  resourcePackage: MdmResourceStatusEntry,
  matchedSignals: RequestSignal[]
): string {
  const state =
    resourcePackage.status === "ready"
      ? "already cached"
      : "not cached yet";

  return `${resourcePackage.packageId} matched ${matchedSignals.join(", ")} and is ${state}.`;
}

function buildInstallHint(
  packageId: string,
  registryRoot: string | undefined
): MdmPackageRecommendation["mdmReleaseInstall"] {
  return {
    packageId,
    downloadPolicy: "disabled",
    manifestPath: registryRoot
      ? join(registryRoot, "release-out", "mdm-release-manifest.json")
      : undefined
  };
}

function compareRecommendations(
  left: ScoredRecommendation,
  right: ScoredRecommendation
): number {
  return right.score - left.score || left.packageId.localeCompare(right.packageId);
}

type RequestSignal =
  | "kubejs"
  | "datapack"
  | "resourcepack"
  | "client-visual"
  | "mappings"
  | "docs";

type ScoredRecommendation = MdmPackageRecommendation & {
  score: number;
};
