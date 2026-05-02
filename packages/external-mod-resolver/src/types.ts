export type ExternalModResolverSource = "maven" | "modrinth" | "curseforge";

export type ExternalModCandidateConfidence = "high" | "medium" | "low";

export type ExternalModCandidateCachePolicy =
  | "metadata_only"
  | "download_allowed"
  | "download_denied";

export interface ExternalModCandidate {
  source: ExternalModResolverSource;
  confidence: ExternalModCandidateConfidence;
  confidenceReasons: string[];
  projectId: string;
  slug: string;
  title: string;
  versionId: string;
  versionNumber: string;
  loaders: string[];
  minecraftVersions: string[];
  fileName: string;
  downloadUrl: string;
  hashes: Record<string, string>;
  mavenArtifacts: ExternalModMavenArtifact[];
  requiresConfirmation: boolean;
  cachePolicy: ExternalModCandidateCachePolicy;
}

export interface ExternalModResolverWarning {
  code: string;
  message: string;
  setupUrl?: string;
  credentialEnvVar?: string;
  projectHints?: ExternalModProjectHint[];
}

export interface ExternalModProjectHint {
  source: ExternalModResolverSource;
  projectId: string;
  slug: string;
  title: string;
  downloads?: number;
}

export interface ExternalModResolverResult {
  source: ExternalModResolverSource;
  query: string;
  candidates: ExternalModCandidate[];
  warnings: ExternalModResolverWarning[];
  cacheTrace?: ExternalModResolverCacheTrace;
}

export interface ExternalModResolverCacheTrace {
  hits: string[];
  misses: string[];
  writes: string[];
}

export type ExternalModMavenArtifactSource =
  | "maven-repository"
  | "modrinth-maven"
  | "cursemaven";

export interface ExternalModMavenArtifact {
  source: ExternalModMavenArtifactSource;
  repositoryName: string;
  repositoryUrl: string;
  group: string;
  artifact: string;
  version: string;
  coordinates: string;
  aliases: string[];
  gradle: ExternalModGradleUsage;
}

export interface ExternalModGradleUsage {
  repositoryGroovy: string;
  repositoryKotlin: string;
  loom: {
    modImplementation: string;
    modCompileOnly: string;
    modRuntimeOnly: string;
    modLocalRuntime: string;
  };
  forgeGradle: {
    implementationFgDeobf: string;
    compileOnlyFgDeobf: string;
    runtimeOnlyFgDeobf: string;
  };
}
