import {
  readLocalMdmResourceRegistry,
  resolveMdmResourceCacheLayout,
  summarizeMdmResourceStatus,
  type MdmResourceStatusSummary
} from "@mcpskill/resource-registry";

export type MdmResourceStatusContextState =
  | "unconfigured"
  | "available"
  | "unavailable";

export interface MdmResourceStatusContext {
  status: MdmResourceStatusContextState;
  registryRoot?: string;
  cacheRoot: string;
  summary?: MdmResourceStatusSummary;
  message: string;
  error?: string;
}

export interface BuildMdmResourceStatusContextInput {
  runtimeRoot: string;
  mdmSourcesRoot?: string;
}

export async function buildMdmResourceStatusContext(
  input: BuildMdmResourceStatusContextInput
): Promise<MdmResourceStatusContext> {
  const cacheLayout = resolveMdmResourceCacheLayout(input.runtimeRoot);

  if (!input.mdmSourcesRoot) {
    return {
      status: "unconfigured",
      cacheRoot: cacheLayout.root,
      message:
        "MDM_SOURCES_ROOT is not set; local MDM resource packages were not checked."
    };
  }

  try {
    const registry = await readLocalMdmResourceRegistry(input.mdmSourcesRoot);
    const summary = await summarizeMdmResourceStatus({
      registry,
      cacheLayout
    });

    return {
      status: "available",
      registryRoot: registry.root,
      cacheRoot: cacheLayout.root,
      summary,
      message: "Local MDM resource registry was loaded."
    };
  } catch (error) {
    return {
      status: "unavailable",
      registryRoot: input.mdmSourcesRoot,
      cacheRoot: cacheLayout.root,
      message: "Local MDM resource registry could not be loaded.",
      error: toErrorMessage(error)
    };
  }
}

export function formatMdmResourceStatusPrompt(
  context: MdmResourceStatusContext
): string {
  if (context.status === "unconfigured") {
    return [
      "MDM resources: unconfigured.",
      "Required and optional offline resource packages were not checked.",
      "Guidance: source files remain authoritative; use built-in tools and workspace evidence before guessing."
    ].join("\n");
  }

  if (context.status === "unavailable") {
    return [
      `MDM resources: unavailable; registry=${context.registryRoot}.`,
      `Reason: ${context.error ?? context.message}`,
      "Guidance: do not assume required offline packages are present when the registry cannot be read."
    ].join("\n");
  }

  const counts = context.summary?.counts;
  const packages = context.summary?.packages ?? [];

  return [
    `MDM resources: available; registry=${context.registryRoot}; cache=${context.cacheRoot}.`,
    `MDM resource status: ready=${counts?.ready ?? 0}; missing_required=${counts?.missing_required ?? 0}; missing_optional=${counts?.missing_optional ?? 0}; invalid_checksum=${counts?.invalid_checksum ?? 0}.`,
    `MDM packages: ${formatPackageStatuses(packages)}`,
    "Guidance: required MDM packages are offline documentation dependencies; optional packages are accelerators only."
  ].join("\n");
}

function formatPackageStatuses(
  packages: NonNullable<MdmResourceStatusSummary["packages"]>
): string {
  if (packages.length === 0) {
    return "none";
  }

  return packages
    .slice(0, 12)
    .map((resourcePackage) => `${resourcePackage.packageId}=${resourcePackage.status}`)
    .join(", ");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
