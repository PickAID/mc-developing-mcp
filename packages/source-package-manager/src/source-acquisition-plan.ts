export type SourceAcquisitionPurpose =
  | "source_lookup"
  | "crash_triage"
  | "datapack_lookup"
  | "resourcepack_lookup"
  | "migration";

export type SourceAcquisitionRemoteSource =
  | "modrinth"
  | "curseforge"
  | "official"
  | "github";

export type SourceAcquisitionOrigin =
  | "workspace_gradle"
  | "workspace_probejs"
  | "runtime_cache"
  | "local_jar"
  | "user_jar"
  | SourceAcquisitionRemoteSource;

export type SourceAcquisitionArtifactStrategy =
  | "read_declared_dependencies"
  | "read_probejs_types_and_registries"
  | "query_cached_packages_and_indexes"
  | "index_binary_jar"
  | "generate_vanilla_source_or_assets"
  | "resolve_remote_jar_metadata"
  | "resolve_remote_source_repository";

export type SourceAcquisitionCacheMode =
  | "workspace_overlay"
  | "runtime_metadata_cache"
  | "runtime_artifact_cache"
  | "runtime_source_index_cache";

export type SourceAcquisitionPrivacy =
  | "workspace_local"
  | "private_local_cache"
  | "public_metadata";

export interface SourceAcquisitionRequest {
  purpose: SourceAcquisitionPurpose;
  minecraftVersion?: string;
  loader?: string;
  localJarPaths?: string[];
  userJarPaths?: string[];
  remoteSources?: SourceAcquisitionRemoteSource[];
}

export interface SourceAcquisitionWorkspace {
  available: boolean;
  hasGradle?: boolean;
  hasProbeJs?: boolean;
}

export interface SourceAcquisitionPolicies {
  remoteDownloads: "deny" | "confirm" | "allow";
  curseforgeCredentials: boolean;
}

export interface SourceAcquisitionPlanInput {
  request: SourceAcquisitionRequest;
  workspace: SourceAcquisitionWorkspace;
  policies: SourceAcquisitionPolicies;
}

export interface SourceAcquisitionRoute {
  origin: SourceAcquisitionOrigin;
  priority: number;
  artifactStrategy: SourceAcquisitionArtifactStrategy;
  cacheMode: SourceAcquisitionCacheMode;
  privacy: SourceAcquisitionPrivacy;
  requiresWorkspace: boolean;
  requiresUserConsent: boolean;
  distributionPolicy: "workspace_only" | "private_cache_only" | "local_generation_only";
  warnings: string[];
}

export interface SourceAcquisitionPlan {
  requiresWorkspace: boolean;
  routes: SourceAcquisitionRoute[];
  summary: string;
}

export function planSourceAcquisition(
  input: SourceAcquisitionPlanInput
): SourceAcquisitionPlan {
  const routes = [
    ...workspaceRoutes(input.workspace),
    runtimeCacheRoute(),
    ...jarRoutes(input.request),
    ...remoteRoutes(input.request, input.policies)
  ].map((route, index) => ({ ...route, priority: index + 1 }));

  return {
    requiresWorkspace: false,
    routes,
    summary:
      "Source acquisition uses workspace evidence when present, then runtime cache, local jars, and consent-gated remote or official origins."
  };
}

function workspaceRoutes(
  workspace: SourceAcquisitionWorkspace
): Array<Omit<SourceAcquisitionRoute, "priority">> {
  if (!workspace.available) {
    return [];
  }

  return [
    workspace.hasGradle ? workspaceRoute({
      origin: "workspace_gradle",
      artifactStrategy: "read_declared_dependencies"
    }) : undefined,
    workspace.hasProbeJs ? workspaceRoute({
      origin: "workspace_probejs",
      artifactStrategy: "read_probejs_types_and_registries"
    }) : undefined
  ].filter((route): route is Omit<SourceAcquisitionRoute, "priority"> =>
    route !== undefined
  );
}

function workspaceRoute(input: {
  origin: "workspace_gradle" | "workspace_probejs";
  artifactStrategy: SourceAcquisitionArtifactStrategy;
}): Omit<SourceAcquisitionRoute, "priority"> {
  return {
    origin: input.origin,
    artifactStrategy: input.artifactStrategy,
    cacheMode: "workspace_overlay",
    privacy: "workspace_local",
    requiresWorkspace: true,
    requiresUserConsent: false,
    distributionPolicy: "workspace_only",
    warnings: []
  };
}

function runtimeCacheRoute(): Omit<SourceAcquisitionRoute, "priority"> {
  return {
    origin: "runtime_cache",
    artifactStrategy: "query_cached_packages_and_indexes",
    cacheMode: "runtime_source_index_cache",
    privacy: "private_local_cache",
    requiresWorkspace: false,
    requiresUserConsent: false,
    distributionPolicy: "private_cache_only",
    warnings: []
  };
}

function jarRoutes(
  request: SourceAcquisitionRequest
): Array<Omit<SourceAcquisitionRoute, "priority">> {
  return [
    ...(request.localJarPaths?.length ? [jarRoute("local_jar")] : []),
    ...(request.userJarPaths?.length ? [jarRoute("user_jar")] : [])
  ];
}

function jarRoute(
  origin: "local_jar" | "user_jar"
): Omit<SourceAcquisitionRoute, "priority"> {
  return {
    origin,
    artifactStrategy: "index_binary_jar",
    cacheMode: "runtime_artifact_cache",
    privacy: "private_local_cache",
    requiresWorkspace: false,
    requiresUserConsent: false,
    distributionPolicy: "private_cache_only",
    warnings: []
  };
}

function remoteRoutes(
  request: SourceAcquisitionRequest,
  policies: SourceAcquisitionPolicies
): Array<Omit<SourceAcquisitionRoute, "priority">> {
  return remoteSources(request).map((source) => {
    if (source === "official") {
      return officialRoute();
    }
    if (source === "github") {
      return githubRoute(policies);
    }

    return remoteJarRoute(source, policies);
  });
}

function remoteSources(
  request: SourceAcquisitionRequest
): SourceAcquisitionRemoteSource[] {
  const requested = new Set(request.remoteSources ?? []);
  return ["official", "modrinth", "curseforge", "github"].filter(
    (source): source is SourceAcquisitionRemoteSource =>
      requested.has(source as SourceAcquisitionRemoteSource)
  );
}

function officialRoute(): Omit<SourceAcquisitionRoute, "priority"> {
  return {
    origin: "official",
    artifactStrategy: "generate_vanilla_source_or_assets",
    cacheMode: "runtime_artifact_cache",
    privacy: "private_local_cache",
    requiresWorkspace: false,
    requiresUserConsent: true,
    distributionPolicy: "local_generation_only",
    warnings: []
  };
}

function githubRoute(
  policies: SourceAcquisitionPolicies
): Omit<SourceAcquisitionRoute, "priority"> {
  return {
    origin: "github",
    artifactStrategy: "resolve_remote_source_repository",
    cacheMode: "runtime_metadata_cache",
    privacy: "public_metadata",
    requiresWorkspace: false,
    requiresUserConsent: policies.remoteDownloads !== "allow",
    distributionPolicy: "private_cache_only",
    warnings: remoteWarnings("github", policies)
  };
}

function remoteJarRoute(
  origin: "modrinth" | "curseforge",
  policies: SourceAcquisitionPolicies
): Omit<SourceAcquisitionRoute, "priority"> {
  return {
    origin,
    artifactStrategy: "resolve_remote_jar_metadata",
    cacheMode: "runtime_metadata_cache",
    privacy: "public_metadata",
    requiresWorkspace: false,
    requiresUserConsent: true,
    distributionPolicy: "private_cache_only",
    warnings: remoteWarnings(origin, policies)
  };
}

function remoteWarnings(
  origin: SourceAcquisitionRemoteSource,
  policies: SourceAcquisitionPolicies
): string[] {
  return [
    ...(policies.remoteDownloads === "deny" ? ["remote_download_denied"] : []),
    ...(origin === "curseforge" && !policies.curseforgeCredentials
      ? ["curseforge_credentials_required"]
      : [])
  ];
}
