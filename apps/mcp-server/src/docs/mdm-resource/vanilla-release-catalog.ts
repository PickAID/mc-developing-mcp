import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { MinecraftReleaseCatalog } from "@mcpskill/source-package-manager";

import type { MdmResourceStatusContext } from "./mdm-resource-status.js";

export interface MdmVanillaReleaseCatalogContext {
  status: "ready" | "unavailable";
  packageId: "minecraft-release-catalog";
  artifactPath?: string;
  catalog?: MinecraftReleaseCatalog;
  installSuggestion: MdmVanillaReleaseCatalogInstallSuggestion;
  message: string;
}

const CATALOG_PACKAGE_ID = "minecraft-release-catalog" as const;

export interface MdmVanillaReleaseCatalogInstallSuggestion {
  packageId: typeof CATALOG_PACKAGE_ID;
  downloadPolicy: "disabled";
  manifestPath?: string;
  mdmReleaseInstall: {
    packageId: typeof CATALOG_PACKAGE_ID;
    downloadPolicy: "disabled";
    manifestPath?: string;
  };
  summary: string;
}

export async function loadMdmVanillaReleaseCatalog(
  context: MdmResourceStatusContext
): Promise<MdmVanillaReleaseCatalogContext> {
  const entry = context.summary?.packages.find(
    (resourcePackage) =>
      resourcePackage.packageId === CATALOG_PACKAGE_ID &&
      resourcePackage.status === "ready" &&
      resourcePackage.artifactPath
  );

  if (!entry?.artifactPath) {
    return {
      status: "unavailable",
      packageId: CATALOG_PACKAGE_ID,
      installSuggestion: buildCatalogInstallSuggestion(context),
      message:
        "minecraft-release-catalog is not cached; vanilla generation target planning is unavailable."
    };
  }

  try {
    return {
      status: "ready",
      packageId: CATALOG_PACKAGE_ID,
      artifactPath: entry.artifactPath,
      catalog: await readReleaseCatalogArtifact(entry.artifactPath),
      installSuggestion: buildCatalogInstallSuggestion(context),
      message: "minecraft-release-catalog is ready."
    };
  } catch (error) {
    return {
      status: "unavailable",
      packageId: CATALOG_PACKAGE_ID,
      artifactPath: entry.artifactPath,
      installSuggestion: buildCatalogInstallSuggestion(context),
      message: `minecraft-release-catalog could not be read: ${toErrorMessage(error)}`
    };
  }
}

function buildCatalogInstallSuggestion(
  context: MdmResourceStatusContext
): MdmVanillaReleaseCatalogInstallSuggestion {
  const manifestPath = context.registryRoot
    ? join(context.registryRoot, "release-out", "mdm-release-manifest.json")
    : undefined;

  return {
    packageId: CATALOG_PACKAGE_ID,
    downloadPolicy: "disabled",
    manifestPath,
    mdmReleaseInstall: {
      packageId: CATALOG_PACKAGE_ID,
      downloadPolicy: "disabled",
      manifestPath
    },
    summary:
      "Call mc_develop again with mdmReleaseInstall for minecraft-release-catalog. Keep downloadPolicy disabled for confirmation, then use allowed only after explicit user approval."
  };
}

async function readReleaseCatalogArtifact(
  artifactPath: string
): Promise<MinecraftReleaseCatalog> {
  const artifact = JSON.parse(await readFile(artifactPath, "utf-8")) as {
    payload?: Record<string, { repoPath?: string; content?: string }>;
  };
  const payload = Object.values(artifact.payload ?? {}).find(
    (entry) => entry.repoPath?.endsWith("release-catalog.json")
  );

  if (!payload?.content) {
    throw new Error("release-catalog.json payload entry is missing.");
  }

  return JSON.parse(payload.content) as MinecraftReleaseCatalog;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
