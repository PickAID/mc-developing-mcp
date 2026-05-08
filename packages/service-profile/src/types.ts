import type { CurrentRuntime, WorkspaceKind } from "minecraft-developing-mcp-shared-types";
import type {
  ExecutableResolver,
  JdtlsServiceProfile
} from "minecraft-developing-mcp-java-jdtls-adapter";
import type { ModArchiveCandidate } from "minecraft-developing-mcp-jar-source-adapter";

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
  sourceIndexDatabasePaths?: string[];
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

export interface ResourcePackServiceCapability {
  status: ServiceCapabilityStatus;
  rootCount: number;
  fileCount: number;
  namespaces: string[];
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
  resourcePack: ResourcePackServiceCapability;
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
