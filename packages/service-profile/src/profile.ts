import { resolve } from "node:path";

import { discoverDatapackContent, listDatapackFiles } from "@mcpskill/datapack-adapter";
import { discoverGradleSourceArchives } from "@mcpskill/gradle-adapter";
import { discoverModArchives } from "@mcpskill/jar-source-adapter";
import { buildJdtlsServiceProfile } from "@mcpskill/java-jdtls-adapter";
import { discoverKubeJsTypeResources } from "@mcpskill/kubejs-types-adapter";
import { detectWorkspace } from "@mcpskill/workspace-detector";

import { buildServiceProfileGuidance } from "./guidance.js";
import { findSourceIndexDatabases } from "./source-indexes.js";
import type {
  BuildMinecraftServiceProfileOptions,
  MinecraftServiceProfile,
  ServiceCapabilityStatus
} from "./types.js";

const DEFAULT_MAX_PROBE_FILES = 2_000;
const DEFAULT_MAX_DATAPACK_FILES = 2_000;
const DEFAULT_MAX_MOD_ARCHIVES = 256;
const DEFAULT_MAX_SOURCE_INDEX_DATABASES = 32;

export async function buildMinecraftServiceProfile(
  options: BuildMinecraftServiceProfileOptions
): Promise<MinecraftServiceProfile> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const [
    descriptor,
    sourceArchives,
    javaLsp,
    kubejsTypes,
    datapack,
    modArchives,
    sourceIndexDatabases
  ] = await Promise.all([
    detectWorkspace(workspaceRoot),
    discoverGradleSourceArchives({
      workspaceRoot,
      gradleUserHome: options.gradleUserHome,
      includeDefaultGradleUserHome: options.includeDefaultGradleUserHome,
      maxResults: 16,
      maxVisitedEntries: 4_000
    }),
    buildJdtlsServiceProfile({
      workspaceRoot,
      env: options.env,
      executableResolver: options.executableResolver
    }),
    discoverKubeJsTypeResources({
      workspaceRoot,
      maxFiles: options.maxProbeFiles ?? DEFAULT_MAX_PROBE_FILES
    }),
    buildDatapackCapability(
      workspaceRoot,
      options.maxDatapackFiles ?? DEFAULT_MAX_DATAPACK_FILES
    ),
    discoverModArchives({
      workspaceRoot,
      maxArchives: options.maxModArchives ?? DEFAULT_MAX_MOD_ARCHIVES
    }),
    findSourceIndexDatabases(
      options.runtimeRoot,
      options.maxSourceIndexDatabases ?? DEFAULT_MAX_SOURCE_INDEX_DATABASES
    )
  ]);

  const profileWithoutGuidance = {
    workspaceRoot,
    workspaceKind: descriptor.kind,
    runtime: descriptor.currentRuntime,
    capabilities: {
      gradle: {
        status: descriptor.hasGradle ? "ready" : "not_found",
        buildFileCount: descriptor.buildFiles.length,
        sourceArchiveCount: sourceArchives.length,
        sourceArchives: sourceArchives.map((candidate) => candidate.archivePath)
      },
      javaLsp,
      kubejsTypes: {
        status: kubejsTypes.summary.fileCount > 0 ? "ready" : "not_found",
        rootCount: kubejsTypes.summary.rootCount,
        fileCount: kubejsTypes.summary.fileCount,
        bySourceKind: kubejsTypes.summary.bySourceKind
      },
      datapack,
      modArchives: {
        status: modArchives.archives.length > 0 ? "ready" : "not_found",
        archiveCount: modArchives.archives.length,
        archives: modArchives.archives,
        truncated: modArchives.truncated
      },
      packageManager: {
        status: options.runtimeRoot ? "ready" : "not_configured",
        runtimeRoot: options.runtimeRoot
      },
      sourceIndex: {
        status: sourceIndexDatabases.length > 0 ? "ready" : "not_found",
        databaseCount: sourceIndexDatabases.length,
        databases: sourceIndexDatabases
      }
    }
  } satisfies Omit<MinecraftServiceProfile, "guidance">;

  return {
    ...profileWithoutGuidance,
    guidance: buildServiceProfileGuidance(profileWithoutGuidance)
  };
}

async function buildDatapackCapability(
  workspaceRoot: string,
  maxFiles: number
): Promise<MinecraftServiceProfile["capabilities"]["datapack"]> {
  const [discovery, files] = await Promise.all([
    discoverDatapackContent(workspaceRoot),
    listDatapackFiles(workspaceRoot, { maxFiles })
  ]);
  const status: ServiceCapabilityStatus =
    discovery.roots.length > 0 ? "ready" : "not_found";

  return {
    status,
    rootCount: discovery.roots.length,
    fileCount: files.entries.length,
    namespaces: discovery.namespaces,
    dataKinds: discovery.dataKinds,
    assetKinds: discovery.assetKinds
  };
}
