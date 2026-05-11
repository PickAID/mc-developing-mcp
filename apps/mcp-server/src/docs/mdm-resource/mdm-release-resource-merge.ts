import {
  resolveMdmResourceCacheLayout,
  summarizeMdmResourceStatus,
  toMdmResourceRegistryFromReleaseManifest
} from "minecraft-developing-mcp-resource-registry";

import type { McpMdmReleaseInstallResult } from "./mdm-release-install.js";
import type { MdmResourceStatusContext } from "./mdm-resource-status.js";

export async function mergeInstalledReleaseResources(input: {
  runtimeRoot: string;
  mdmResources: MdmResourceStatusContext;
  mdmReleaseInstall: McpMdmReleaseInstallResult | undefined;
}): Promise<MdmResourceStatusContext> {
  const manifest = input.mdmReleaseInstall?.manifest;
  if (!manifest) {
    return input.mdmResources;
  }

  const releaseSummary = await summarizeMdmResourceStatus({
    registry: toMdmResourceRegistryFromReleaseManifest(manifest),
    cacheLayout: resolveMdmResourceCacheLayout(input.runtimeRoot)
  });
  const localPackages = input.mdmResources.summary?.packages ?? [];
  const mergedPackages = mergeResourcePackages(
    localPackages,
    releaseSummary.packages
  );

  return {
    ...input.mdmResources,
    status: "available",
    summary: {
      packages: mergedPackages,
      counts: countResourceStatuses(mergedPackages)
    }
  };
}

function mergeResourcePackages(
  localPackages: NonNullable<MdmResourceStatusContext["summary"]>["packages"],
  releasePackages: NonNullable<MdmResourceStatusContext["summary"]>["packages"]
) {
  const byPackageId = new Map(
    localPackages.map((resourcePackage) => [
      resourcePackage.packageId,
      resourcePackage
    ])
  );

  for (const resourcePackage of releasePackages) {
    if (resourcePackage.status !== "ready") {
      continue;
    }
    byPackageId.set(resourcePackage.packageId, resourcePackage);
  }

  return [...byPackageId.values()];
}

function countResourceStatuses(
  packages: NonNullable<MdmResourceStatusContext["summary"]>["packages"]
): NonNullable<MdmResourceStatusContext["summary"]>["counts"] {
  return packages.reduce(
    (counts, resourcePackage) => ({
      ...counts,
      [resourcePackage.status]: counts[resourcePackage.status] + 1
    }),
    {
      missing_required: 0,
      missing_optional: 0,
      ready: 0,
      invalid_checksum: 0,
      invalid_artifact: 0
    }
  );
}
