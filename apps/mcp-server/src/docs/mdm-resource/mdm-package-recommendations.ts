import { join } from "node:path";

import type {
  MdmResourcePackageStatus,
  MdmResourceStatusEntry
} from "minecraft-developing-mcp-resource-registry";

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
  minecraftVersion?: string;
  minecraftLoader?: string;
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
  const requestedMinecraftVersions = detectRequestedMinecraftVersions({
    requestText: input.requestText,
    workspaceMinecraftVersion: input.minecraftVersion
  });
  const requestedMinecraftLoader =
    detectMinecraftLoader(input.requestText) ?? normalizeMinecraftLoader(input.minecraftLoader);
  const suggestions = (input.mdmResources.summary?.packages ?? [])
    .map((resourcePackage) =>
      scorePackage({
        resourcePackage,
        signals,
        requestedMinecraftVersions,
        requestedMinecraftLoader,
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
  requestedMinecraftVersions: string[];
  requestedMinecraftLoader?: MinecraftProfileLoader;
  registryRoot?: string;
}): ScoredRecommendation | undefined {
  const matchedSignals = matchPackageSignals(input.resourcePackage, input.signals);
  if (matchedSignals.length === 0) {
    return undefined;
  }
  if (!matchesRequestedVersionedProfile(input.resourcePackage, input.requestedMinecraftVersions)) {
    return undefined;
  }
  if (!matchesRequestedLoaderProfile(input.resourcePackage, input.requestedMinecraftLoader)) {
    return undefined;
  }

  const statusWeight = input.resourcePackage.status === "ready" ? -1 : 1;
  const versionWeight = getRequestedVersionWeight(
    input.resourcePackage,
    input.requestedMinecraftVersions
  );
  const loaderWeight = getRequestedLoaderWeight(
    input.resourcePackage,
    input.requestedMinecraftLoader
  );
  const score = matchedSignals.length * 10 + versionWeight + loaderWeight + statusWeight;
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
  addSignal(signals, normalized, "schema-docs", /schema|mcdoc|vanilla[- ]?mcdoc|misode|explain|解释器|解释|结构|格式/u);
  addSignal(signals, normalized, "version-changes", /version changes?|technical changes?|changelog|change log|migration|migrate|upgrade|porting|primers?|neoforged primers?|neoforge primers?|misode changelog|technical-changes|版本变化|版本变更|迁移|升级|移植|更新日志|变更日志/u);
  addSignal(signals, normalized, "loader-docs", /neo[\s-]?forge(?:d)? docs?|neo[\s-]?forge(?:d)? documentation|docs\.neoforged\.net|neoforged\.net\/news|forge docs?|forge documentation|docs\.minecraftforge\.net|championash5357|loader docs?|加载器文档|加载器资料/u);
  addSignal(signals, normalized, "client-visual", /client visual|\bgui\b|\bui\b|render|renderer|shader|screen|nine|nine-slice|视觉|渲染|界面/u);
  addSignal(signals, normalized, "mappings", /mapping|mapped|remap|yarn|parchment|mojmap|official name|obfuscated|mixin target|映射|混淆/u);
  addSignal(signals, normalized, "sources", /source|sources|source lookup|source pack|source index|decompile|decompiled|源码|源代码|反编译/u);
  if (signals.size === 0) {
    addSignal(signals, normalized, "docs", /docs|documentation|guide|guidance|explain|参考|文档|说明/u);
  }

  return signals;
}

function detectMinecraftVersions(requestText: string): string[] {
  const matches = requestText.match(/\b(?:\d+\.)+\d+\b/gu) ?? [];
  return [...new Set(matches)];
}

function detectRequestedMinecraftVersions(input: {
  requestText: string;
  workspaceMinecraftVersion?: string;
}): string[] {
  const textVersions = detectMinecraftVersions(input.requestText);
  if (textVersions.length > 0) {
    return textVersions;
  }

  return input.workspaceMinecraftVersion ? [input.workspaceMinecraftVersion] : [];
}

function detectMinecraftLoader(requestText: string): MinecraftProfileLoader | undefined {
  const normalized = requestText.toLowerCase();
  if (/\bneo[\s-]?forge\b/u.test(normalized)) {
    return "neoforge";
  }
  if (/\bfabric\b/u.test(normalized)) {
    return "fabric";
  }
  if (/\bquilt\b/u.test(normalized)) {
    return "quilt";
  }
  if (/\bforge\b/u.test(normalized)) {
    return "forge";
  }

  return undefined;
}

function normalizeMinecraftLoader(loader: string | undefined): MinecraftProfileLoader | undefined {
  if (!loader) {
    return undefined;
  }

  const normalized = loader.toLowerCase().replace(/[\s_-]+/gu, "");
  if (
    normalized === "forge" ||
    normalized === "neoforge" ||
    normalized === "fabric" ||
    normalized === "quilt"
  ) {
    return normalized;
  }

  return undefined;
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
    resourcePackage.artifactType,
    resourcePackage.artifactKind,
    resourcePackage.queryAdapter,
    resourcePackage.releaseChannel,
    resourcePackage.releaseFamily,
    ...(resourcePackage.capabilities ?? []),
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
    if (signal === "sources") {
      return /\bsources?\b|\bsource[-_ ]?(?:index|lookup|chunk|pack|tree)\b|source_index_sqlite/u.test(
        searchable
      );
    }
    if (signal === "schema-docs") {
      return /schema|mcdoc|misode|vanilla[-_ ]?docs|format[-_ ]?reference/u.test(
        searchable
      );
    }
    if (signal === "version-changes") {
      return /version[-_ ]?changes?|technical[-_ ]?changes?|changelog|migration[-_ ]?reference|neoforge(?:d)?[-_ ]?primer|misode[-_ ]?changelog/u.test(
        searchable
      );
    }
    if (signal === "loader-docs") {
      return /loader[-_ ]?docs|minecraft[-_ ]?loader[-_ ]?docs|neoforge(?:d)?[-_ ]?docs?|forge[-_ ]?docs?|documentation/u.test(
        searchable
      );
    }

    return searchable.includes(signal);
  });
}

function matchesRequestedVersionedProfile(
  resourcePackage: MdmResourceStatusEntry,
  requestedMinecraftVersions: string[]
): boolean {
  if (requestedMinecraftVersions.length === 0 || !isVersionedMinecraftProfile(resourcePackage)) {
    return true;
  }

  return requestedMinecraftVersions.includes(getVersionedMinecraftProfileVersion(resourcePackage) ?? "");
}

function matchesRequestedLoaderProfile(
  resourcePackage: MdmResourceStatusEntry,
  requestedMinecraftLoader: MinecraftProfileLoader | undefined
): boolean {
  if (!requestedMinecraftLoader) {
    return true;
  }

  const profile = getVersionedMinecraftProfile(resourcePackage);
  return (
    profile?.loader === undefined ||
    profile.loader === "vanilla" ||
    profile.loader === requestedMinecraftLoader
  );
}

function getRequestedVersionWeight(
  resourcePackage: MdmResourceStatusEntry,
  requestedMinecraftVersions: string[]
): number {
  if (
    requestedMinecraftVersions.length === 0 ||
    !isVersionedMinecraftProfile(resourcePackage)
  ) {
    return 0;
  }

  return requestedMinecraftVersions.includes(
    getVersionedMinecraftProfileVersion(resourcePackage) ?? ""
  )
    ? 100
    : 0;
}

function getRequestedLoaderWeight(
  resourcePackage: MdmResourceStatusEntry,
  requestedMinecraftLoader: MinecraftProfileLoader | undefined
): number {
  if (!requestedMinecraftLoader) {
    return 0;
  }

  const profile = getVersionedMinecraftProfile(resourcePackage);
  return profile?.loader === requestedMinecraftLoader ? 50 : 0;
}

function isVersionedMinecraftProfile(resourcePackage: MdmResourceStatusEntry): boolean {
  return getVersionedMinecraftProfileVersion(resourcePackage) !== undefined;
}

function getVersionedMinecraftProfileVersion(
  resourcePackage: MdmResourceStatusEntry
): string | undefined {
  const profile = getVersionedMinecraftProfile(resourcePackage);
  if (profile) {
    return profile.version;
  }

  const indexMatch = resourcePackage.packageId.match(
    /^minecraft-(?<version>.+)-source-index$/u
  );
  if (indexMatch?.groups?.version) {
    return indexMatch.groups.version;
  }

  const versionChangesMatch = resourcePackage.packageId.match(
    /^minecraft-(?<version>.+)-version-changes$/u
  );

  return versionChangesMatch?.groups?.version;
}

function getVersionedMinecraftProfile(
  resourcePackage: MdmResourceStatusEntry
): MinecraftProfile | undefined {
  const match = resourcePackage.packageId.match(
    /^minecraft-(?<version>.+)-(?<loader>vanilla|forge|neoforge|fabric|quilt)-(?<kind>source|datapack|resourcepack)-profile$/u
  );
  if (match?.groups?.version && match.groups.loader) {
    return {
      version: match.groups.version,
      loader: match.groups.loader as MinecraftProfileLoader | "vanilla"
    };
  }

  const mappingMatch = resourcePackage.packageId.match(
    /^minecraft-(?<version>.+)-[a-z0-9-]+-mapping-profile$/u
  );

  return mappingMatch?.groups?.version
    ? { version: mappingMatch.groups.version }
    : undefined;
}

function resolvePriority(input: {
  score: number;
  status: MdmResourcePackageStatus;
  matchedSignals: RequestSignal[];
}): MdmPackageRecommendationPriority {
  const { score, status, matchedSignals } = input;

  if (
    matchedSignals.includes("kubejs") ||
    matchedSignals.includes("sources") ||
    matchedSignals.includes("schema-docs") ||
    matchedSignals.includes("version-changes") ||
    matchedSignals.includes("loader-docs") ||
    score >= 20
  ) {
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
  | "schema-docs"
  | "version-changes"
  | "loader-docs"
  | "client-visual"
  | "mappings"
  | "sources"
  | "docs";

type MinecraftProfileLoader = "forge" | "neoforge" | "fabric" | "quilt";

interface MinecraftProfile {
  version: string;
  loader?: MinecraftProfileLoader | "vanilla";
}

type ScoredRecommendation = MdmPackageRecommendation & {
  score: number;
};
