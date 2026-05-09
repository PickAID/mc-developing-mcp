import type { SourceAcquisitionRoute } from "minecraft-developing-mcp-source-package-manager";

import type { McpServerEvidenceExecutorInput } from "../request/execution/request-handler.js";

export interface SourceAcquisitionCapabilityGuidance {
  statusLines: string[];
  nextActions: string[];
  capabilityMap: SourceAcquisitionCapabilityMap;
}

export interface SourceAcquisitionCapabilityMap {
  mode: "progressive_discovery";
  serviceStatus: SourceAcquisitionServiceStatus[];
  routeCapabilities: SourceAcquisitionRouteCapability[];
  recommendedRouteOrder: string[];
}

export interface SourceAcquisitionServiceStatus {
  service: string;
  status: string;
  detail: string;
}

export interface SourceAcquisitionRouteCapability {
  origin: string;
  status: "ready" | "not_available" | "requires_confirmation" | "requires_credentials";
  priority: number;
  artifactStrategy: string;
  cacheMode: string;
  privacy: string;
  useFor: string[];
  sourceLookup?: SourceAcquisitionSourceLookupCapability;
  nextAction?: string;
  warnings: string[];
}

export interface SourceAcquisitionSourceLookupCapability {
  sourceArchiveCount: number;
  declaredDependencySourceArchiveCount: number;
  declaredDependencyBinaryArchiveCount: number;
  supportsDirectSourceRead: boolean;
  supportsBinaryOwnerLookup: boolean;
  status: "ready" | "partial" | "not_found";
}

export function buildSourceAcquisitionCapabilityGuidance(input: {
  executorInput: McpServerEvidenceExecutorInput;
  routes: SourceAcquisitionRoute[];
}): SourceAcquisitionCapabilityGuidance {
  const statusLines = extractStatusLines(input.executorInput);
  const serviceStatus = statusLines.map(parseStatusLine);
  const routeCapabilities = input.routes.map((route) =>
    buildRouteCapability(route, serviceStatus)
  );

  return {
    statusLines,
    nextActions: buildPreparationNextActions(serviceStatus),
    capabilityMap: {
      mode: "progressive_discovery",
      serviceStatus,
      routeCapabilities,
      recommendedRouteOrder: routeCapabilities
        .filter((route) => route.status === "ready")
        .map((route) => route.origin)
    }
  };
}

export function buildSourceAcquisitionPlanSummary(input: {
  routeCount: number;
  capabilityGuidance: SourceAcquisitionCapabilityGuidance;
}): string {
  const [nextAction] = input.capabilityGuidance.nextActions;
  if (!nextAction) {
    return `Planned ${input.routeCount} source acquisition routes.`;
  }

  return `Planned ${input.routeCount} source acquisition routes; next action: ${nextAction}`;
}

function extractStatusLines(
  input: McpServerEvidenceExecutorInput
): string[] {
  const requestContext = input.requestPlan.requestContext as {
    taskBrief?: { promptFragments?: Array<{ id: string; text: string }> };
  };
  const promptFragments = requestContext.taskBrief?.promptFragments ?? [];
  const serviceProfile = promptFragments
    .find((fragment) => fragment.id === "service_profile")
    ?.text;

  return serviceProfile
    ? serviceProfile.split("\n").filter(isServiceProfileStatusLine)
    : [];
}

function isServiceProfileStatusLine(line: string): boolean {
  return /^(Gradle|Java LSP|ProbeJS types|Datapack|Resource pack|Mod archives|Source indexes): /.test(
    line
  );
}

function parseStatusLine(line: string): SourceAcquisitionServiceStatus {
  const [service = "unknown", rest = "unknown"] = line.split(": ");
  const [status = "unknown", ...detailParts] = rest.split(", ");

  return {
    service,
    status,
    detail: detailParts.join(", ")
  };
}

function buildPreparationNextActions(
  services: SourceAcquisitionServiceStatus[]
): string[] {
  const actions: string[] = [];
  const gradle = findService(services, "Gradle");
  const javaLsp = findService(services, "Java LSP");
  const gradleSourceLookup = gradle ? parseGradleSourceLookup(gradle) : undefined;

  if (gradle?.status === "ready" && gradleSourceLookup?.status === "not_found") {
    actions.push(
      "run Gradle sync or ./gradlew --refresh-dependencies to populate dependency jars/source jars before source lookup"
    );
  }
  if (gradle?.status === "ready" && gradleSourceLookup?.status === "partial") {
    actions.push(
      "Gradle binary jars are present; refresh dependency sources for direct source reads"
    );
  }

  if (javaLsp?.status === "missing_jdtls") {
    actions.push(
      "install jdtls or set JDTLS_PATH before expecting Java definitions, references, hover, or diagnostics"
    );
  }

  return actions;
}

function buildRouteCapability(
  route: SourceAcquisitionRoute,
  services: SourceAcquisitionServiceStatus[]
): SourceAcquisitionRouteCapability {
  return {
    origin: route.origin,
    status: resolveRouteStatus(route, services),
    priority: route.priority,
    artifactStrategy: route.artifactStrategy,
    cacheMode: route.cacheMode,
    privacy: route.privacy,
    useFor: routeUseCases(route.origin),
    sourceLookup: routeSourceLookup(route, services),
    nextAction: routeNextAction(route, services),
    warnings: route.warnings
  };
}

function resolveRouteStatus(
  route: SourceAcquisitionRoute,
  services: SourceAcquisitionServiceStatus[]
): SourceAcquisitionRouteCapability["status"] {
  if (route.warnings.includes("curseforge_credentials_required")) {
    return "requires_credentials";
  }
  if (route.requiresUserConsent) {
    return "requires_confirmation";
  }
  if (route.origin === "workspace_gradle") {
    const gradle = findService(services, "Gradle");
    return !gradle || gradle.status === "ready"
      ? "ready"
      : "not_available";
  }
  if (route.origin === "workspace_probejs") {
    const probejs = findService(services, "ProbeJS types");
    return !probejs || probejs.status === "ready"
      ? "ready"
      : "not_available";
  }

  return "ready";
}

function routeNextAction(
  route: SourceAcquisitionRoute,
  services: SourceAcquisitionServiceStatus[]
): string | undefined {
  if (route.origin === "workspace_gradle") {
    const gradle = findService(services, "Gradle");
    const sourceLookup = gradle ? parseGradleSourceLookup(gradle) : undefined;
    if (sourceLookup?.status === "not_found") {
      return "run Gradle sync or ./gradlew --refresh-dependencies to populate dependency jars/source jars";
    }
    if (sourceLookup?.status === "partial") {
      return "Gradle binary jars are available; refresh sources for direct source reads";
    }
  }
  if (route.warnings.includes("curseforge_credentials_required")) {
    return "set CURSEFORGE_API_KEY before CurseForge metadata lookup";
  }
  if (route.requiresUserConsent) {
    return "ask the user before downloading or generating artifacts";
  }

  return undefined;
}

function routeUseCases(origin: string): string[] {
  switch (origin) {
    case "workspace_gradle":
      return [
        "declared dependencies",
        "repositories",
        "version evidence",
        "dependency source jars",
        "Gradle cache source archive lookup",
        "binary jar class owner fallback"
      ];
    case "workspace_probejs":
      return ["KubeJS types", "items/tags/fluids", "script DSL evidence"];
    case "runtime_cache":
      return ["offline packages", "SQLite indexes", "previously cached sources"];
    case "local_jar":
    case "user_jar":
      return ["local mod classes", "assets/data content", "JarJar archives"];
    case "official":
      return ["vanilla source/assets generation", "version-bound Minecraft evidence"];
    case "modrinth":
      return ["public mod metadata", "project versions", "Modrinth Maven"];
    case "curseforge":
      return ["CurseForge metadata", "CurseMaven coordinates"];
    case "github":
      return ["public source repositories", "release source links"];
    default:
      return ["source evidence"];
  }
}

function routeSourceLookup(
  route: SourceAcquisitionRoute,
  services: SourceAcquisitionServiceStatus[]
): SourceAcquisitionSourceLookupCapability | undefined {
  if (route.origin !== "workspace_gradle") {
    return undefined;
  }

  const gradle = findService(services, "Gradle");
  return gradle ? parseGradleSourceLookup(gradle) : undefined;
}

function parseGradleSourceLookup(
  gradle: SourceAcquisitionServiceStatus
): SourceAcquisitionSourceLookupCapability {
  const sourceArchiveCount = readDetailCount(gradle.detail, "source archives");
  const declaredDependencySourceArchiveCount = readDetailCount(
    gradle.detail,
    "declared source archives"
  );
  const declaredDependencyBinaryArchiveCount = readDetailCount(
    gradle.detail,
    "binary archives"
  );
  const supportsDirectSourceRead =
    sourceArchiveCount > 0 || declaredDependencySourceArchiveCount > 0;
  const supportsBinaryOwnerLookup = declaredDependencyBinaryArchiveCount > 0;

  return {
    sourceArchiveCount,
    declaredDependencySourceArchiveCount,
    declaredDependencyBinaryArchiveCount,
    supportsDirectSourceRead,
    supportsBinaryOwnerLookup,
    status: supportsDirectSourceRead
      ? "ready"
      : supportsBinaryOwnerLookup
        ? "partial"
        : "not_found"
  };
}

function readDetailCount(detail: string, key: string): number {
  const match = new RegExp(`${escapeRegExp(key)}=(\\d+)`).exec(detail);
  return match ? Number(match[1]) : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findService(
  services: SourceAcquisitionServiceStatus[],
  service: string
): SourceAcquisitionServiceStatus | undefined {
  return services.find((entry) => entry.service === service);
}
