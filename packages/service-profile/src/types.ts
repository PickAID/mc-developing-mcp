import type { CurrentRuntime, WorkspaceKind } from "@mcpskill/shared-types";
import type {
  ExecutableResolver,
  JdtlsServiceProfile
} from "@mcpskill/java-jdtls-adapter";
import type { ModArchiveCandidate } from "@mcpskill/jar-source-adapter";

export type ServiceCapabilityStatus =
  | "ready"
  | "not_found"
  | "not_configured"
  | "partial";

export interface BuildMinecraftServiceProfileOptions {
  workspaceRoot: string;
  runtimeRoot?: string;
  gradleUserHome?: string;
  includeDefaultGradleUserHome?: boolean;
  env?: NodeJS.ProcessEnv;
  executableResolver?: ExecutableResolver;
  maxProbeFiles?: number;
  maxDatapackFiles?: number;
  maxModArchives?: number;
  maxSourceIndexDatabases?: number;
}

export interface GradleServiceCapability {
  status: ServiceCapabilityStatus;
  buildFileCount: number;
  sourceArchiveCount: number;
  sourceArchives: string[];
}

export interface KubeJsTypesServiceCapability {
  status: ServiceCapabilityStatus;
  rootCount: number;
  fileCount: number;
  bySourceKind: Record<string, number>;
}

export interface DatapackServiceCapability {
  status: ServiceCapabilityStatus;
  rootCount: number;
  fileCount: number;
  namespaces: string[];
  dataKinds: string[];
  assetKinds: string[];
}

export interface PackageManagerServiceCapability {
  status: ServiceCapabilityStatus;
  runtimeRoot?: string;
}

export interface SourceIndexServiceCapability {
  status: ServiceCapabilityStatus;
  databaseCount: number;
  databases: string[];
}

export interface ModArchivesServiceCapability {
  status: ServiceCapabilityStatus;
  archiveCount: number;
  archives: ModArchiveCandidate[];
  truncated: boolean;
}

export interface MinecraftServiceCapabilities {
  gradle: GradleServiceCapability;
  javaLsp: JdtlsServiceProfile;
  kubejsTypes: KubeJsTypesServiceCapability;
  datapack: DatapackServiceCapability;
  modArchives: ModArchivesServiceCapability;
  packageManager: PackageManagerServiceCapability;
  sourceIndex: SourceIndexServiceCapability;
}

export interface MinecraftServiceProfile {
  workspaceRoot: string;
  workspaceKind: WorkspaceKind;
  runtime?: CurrentRuntime;
  capabilities: MinecraftServiceCapabilities;
  guidance: string[];
}
