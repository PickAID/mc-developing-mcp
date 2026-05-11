import { resolve } from "node:path";

import { discoverDatapackContent, listDatapackFiles } from "minecraft-developing-mcp-datapack-adapter";
import {
  discoverDeclaredDependencyBinaryArchives,
  discoverDeclaredDependencySourceArchives,
  discoverGradleBinaryArchives,
  discoverGradleSourceArchives
} from "minecraft-developing-mcp-gradle-adapter";
import { discoverModArchives } from "minecraft-developing-mcp-jar-source-adapter";
import { buildJdtlsServiceProfile } from "minecraft-developing-mcp-java-jdtls-adapter";
import { discoverKubeJsTypeResources } from "minecraft-developing-mcp-kubejs-types-adapter";
import { detectWorkspace } from "minecraft-developing-mcp-workspace-detector";

import { buildServiceProfileGuidance } from "./guidance.js";
import { findSourceIndexDatabases } from "./source-indexes.js";
import type {
  BuildMinecraftServiceProfileOptions,
  DatapackServiceCapability,
  MinecraftServiceProfile,
  ResourcePackServiceCapability,
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
    declaredDependencySourceArchives,
    declaredDependencyBinaryArchives,
    gradleCacheBinaryArchives,
    javaLsp,
    kubejsTypes,
    resourceCapabilities,
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
    discoverDeclaredDependencySourceArchives({
      workspaceRoot,
      gradleUserHome: options.gradleUserHome,
      includeDefaultGradleUserHome: options.includeDefaultGradleUserHome,
      maxResults: 16
    }),
    discoverDeclaredDependencyBinaryArchives({
      workspaceRoot,
      gradleUserHome: options.gradleUserHome,
      includeDefaultGradleUserHome: options.includeDefaultGradleUserHome,
      maxResults: 16
    }),
    discoverGradleBinaryArchives({
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
    buildResourceCapabilities(
      workspaceRoot,
      options.maxDatapackFiles ?? DEFAULT_MAX_DATAPACK_FILES
    ),
    discoverModArchives({
      workspaceRoot,
      maxArchives: options.maxModArchives ?? DEFAULT_MAX_MOD_ARCHIVES
    }),
    findSourceIndexDatabases(
      options.runtimeRoot,
      options.maxSourceIndexDatabases ?? DEFAULT_MAX_SOURCE_INDEX_DATABASES,
      options.sourceIndexDatabasePaths
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
        declaredDependencySourceArchiveCount:
          declaredDependencySourceArchives.length,
        declaredDependencyBinaryArchiveCount:
          declaredDependencyBinaryArchives.length,
        gradleCacheSourceArchiveCount: sourceArchives.length,
        gradleCacheBinaryArchiveCount: gradleCacheBinaryArchives.length,
        sourceArchives: sourceArchives.map((candidate) => candidate.archivePath),
        declaredDependencySourceArchives: declaredDependencySourceArchives.map(
          (candidate) => candidate.archivePath
        ),
        declaredDependencyBinaryArchives: declaredDependencyBinaryArchives.map(
          (candidate) => candidate.archivePath
        ),
        gradleCacheSourceArchives: sourceArchives.map(
          (candidate) => candidate.archivePath
        ),
        gradleCacheBinaryArchives: gradleCacheBinaryArchives.map(
          (candidate) => candidate.archivePath
        )
      },
      javaLsp,
      kubejsTypes: {
        status: kubejsTypes.summary.fileCount > 0 ? "ready" : "not_found",
        rootCount: kubejsTypes.summary.rootCount,
        fileCount: kubejsTypes.summary.fileCount,
        bySourceKind: kubejsTypes.summary.bySourceKind
      },
      datapack: resourceCapabilities.datapack,
      resourcePack: resourceCapabilities.resourcePack,
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

async function buildResourceCapabilities(
  workspaceRoot: string,
  maxFiles: number
): Promise<{
  datapack: DatapackServiceCapability;
  resourcePack: ResourcePackServiceCapability;
}> {
  const [discovery, files] = await Promise.all([
    discoverDatapackContent(workspaceRoot),
    listDatapackFiles(workspaceRoot, { maxFiles })
  ]);
  const dataEntries = files.entries.filter((entry) => entry.domain === "data");
  const assetEntries = files.entries.filter((entry) => entry.domain === "assets");

  return {
    datapack: {
      status: statusForCount(dataEntries.length),
      rootCount: discovery.roots.filter((root) => root.hasData).length,
      fileCount: dataEntries.length,
      namespaces: namespacesForEntries(dataEntries),
      dataKinds: discovery.dataKinds,
      assetKinds: discovery.assetKinds
    },
    resourcePack: {
      status: statusForCount(assetEntries.length),
      rootCount: discovery.roots.filter((root) => root.hasAssets).length,
      fileCount: assetEntries.length,
      namespaces: namespacesForEntries(assetEntries),
      assetKinds: discovery.assetKinds
    }
  };
}

function namespacesForEntries(
  entries: Array<{ namespace: string }>
): string[] {
  return [...new Set(entries.map((entry) => entry.namespace))].sort();
}

function statusForCount(count: number): ServiceCapabilityStatus {
  return count > 0 ? "ready" : "not_found";
}
