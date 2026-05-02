export type ExternalModResolverSource = "modrinth";

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
  requiresConfirmation: boolean;
  cachePolicy: ExternalModCandidateCachePolicy;
}

export interface ExternalModResolverWarning {
  code: string;
  message: string;
}

export interface ExternalModResolverResult {
  source: ExternalModResolverSource;
  query: string;
  candidates: ExternalModCandidate[];
  warnings: ExternalModResolverWarning[];
}
