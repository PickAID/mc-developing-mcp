import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  readLocalMdmResourceRegistry,
  resolveMdmResourceCacheLayout,
  summarizeMdmResourceStatus,
  type MdmResourceStatusSummary
} from "minecraft-developing-mcp-resource-registry";

export type MdmResourceStatusContextState =
  | "unconfigured"
  | "available"
  | "unavailable";

export interface MdmResourceStatusContext {
  status: MdmResourceStatusContextState;
  registryRoot?: string;
  cacheRoot: string;
  summary?: MdmResourceStatusSummary;
  releaseAcceptance?: MdmReleaseAcceptanceSummary;
  message: string;
  error?: string;
}

export type MdmReleaseAcceptanceSummary =
  | {
      status: "passed" | "failed";
      generatedAt?: string;
      packageCount: number;
      artifactCount: number;
      totalSizeBytes: number;
      repositoryErrorCount: number;
      schemaErrorCount: number;
      installVerifiedCount: number;
      installPackageCount: number;
    }
  | {
      status: "invalid";
      error: string;
    };

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
    const releaseAcceptance = await readReleaseAcceptanceSummary(
      input.mdmSourcesRoot
    );

    return {
      status: "available",
      registryRoot: registry.root,
      cacheRoot: cacheLayout.root,
      summary,
      releaseAcceptance,
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
    `MDM resource status: ready=${counts?.ready ?? 0}; missing_required=${counts?.missing_required ?? 0}; missing_optional=${counts?.missing_optional ?? 0}; invalid_checksum=${counts?.invalid_checksum ?? 0}; invalid_artifact=${counts?.invalid_artifact ?? 0}.`,
    formatReleaseAcceptancePrompt(context.releaseAcceptance),
    `MDM packages: ${formatPackageStatuses(packages)}`,
    "Guidance: required MDM packages are offline documentation dependencies; optional packages are accelerators only."
  ].join("\n");
}

function formatReleaseAcceptancePrompt(
  summary: MdmReleaseAcceptanceSummary | undefined
): string {
  if (!summary) {
    return "MDM release acceptance: not found in local mdm-sources release-out.";
  }
  if (summary.status === "invalid") {
    return `MDM release acceptance: invalid; reason=${summary.error}`;
  }

  return `MDM release acceptance: status=${summary.status}; packages=${summary.packageCount}; artifacts=${summary.artifactCount}; install=${summary.installVerifiedCount}/${summary.installPackageCount}; repository_errors=${summary.repositoryErrorCount}; schema_errors=${summary.schemaErrorCount}.`;
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

async function readReleaseAcceptanceSummary(
  mdmSourcesRoot: string
): Promise<MdmReleaseAcceptanceSummary | undefined> {
  const reportPath = join(
    mdmSourcesRoot,
    "release-out",
    "mdm-release-acceptance-report.json"
  );

  try {
    const report = JSON.parse(await readFile(reportPath, "utf-8"));

    return {
      status: requireAcceptanceStatus(report.status),
      generatedAt: optionalString(report.generatedAt),
      packageCount: requireNonNegativeInteger(report.release?.packageCount),
      artifactCount: requireNonNegativeInteger(report.release?.artifactCount),
      totalSizeBytes: requireNonNegativeInteger(report.release?.totalSizeBytes),
      repositoryErrorCount: requireNonNegativeInteger(
        report.checks?.repository?.errorCount
      ),
      schemaErrorCount: requireNonNegativeInteger(
        report.checks?.schema?.errorCount
      ),
      installVerifiedCount: requireNonNegativeInteger(
        report.checks?.install?.verifiedCount
      ),
      installPackageCount: requireNonNegativeInteger(
        report.checks?.install?.packageCount
      )
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    return {
      status: "invalid",
      error: toErrorMessage(error)
    };
  }
}

function requireAcceptanceStatus(value: unknown): "passed" | "failed" {
  if (value === "passed" || value === "failed") {
    return value;
  }

  throw new Error("release acceptance status must be passed or failed");
}

function requireNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new Error("release acceptance numeric fields must be non-negative integers");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
