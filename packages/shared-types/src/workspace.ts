export type Loader = "forge" | "neoforge" | "fabric" | "quilt";

export type WorkspaceKind = "unknown" | "java-mod" | "kubejs" | "modpack";

export type RuntimeDetectionSource = "workspace-detect" | "unknown";

export type RuntimeConfidence = "high" | "medium" | "low" | "unknown";

export interface RuntimeEvidence {
  kind: string;
  path: string;
  detail: string;
  value: string;
  weight: RuntimeConfidence;
  structured: boolean;
}

export interface RuntimeCandidate {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
  confidence: RuntimeConfidence;
  evidenceSources: string[];
}

export interface CurrentRuntime {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
  source: RuntimeDetectionSource;
  confidence: RuntimeConfidence;
  evidenceSources: string[];
  candidates: RuntimeCandidate[];
  evidence: RuntimeEvidence[];
}

export interface WorkspaceDescriptor {
  root: string;
  kind: WorkspaceKind;
  hasGradle: boolean;
  hasKubeJS: boolean;
  hasProbeJS: boolean;
  hasModArchives: boolean;
  hasJavaSource: boolean;
  hasDatapack: boolean;
  hasResourcePack?: boolean;
  buildFiles: string[];
  javaSourceRoots: string[];
  modArchivePaths: string[];
  datapackRoots: string[];
  resourcePackRoots?: string[];
  logPaths: string[];
  reasons: string[];
  currentRuntime: CurrentRuntime;
}
