import { createHash } from "node:crypto";
import { copyFile, link, mkdir } from "node:fs/promises";
import { basename, join, normalize, resolve } from "node:path";

import {
  resolveCurseForgeMod,
  resolveModrinthMod,
  type ResolveCurseForgeModInput,
  type ResolveModrinthModInput
} from "@mcpskill/external-mod-resolver";
import { queryCachedModArchiveEntries } from "@mcpskill/jar-source-adapter";
import type {
  SourceAcquisitionWorkItemHandlerResult,
  SourceAcquisitionWorkItemRunnerHandlers,
  SourcePackageRecipeExecutor,
  SourcePackageRecipeProvider,
  SourcePackageRecipeRegistry
} from "@mcpskill/source-package-manager";

import {
  collectMissingConstraints,
  hasRequiredConstraints,
  parseExternalModRequest
} from "../external-mod/resolution/external-mod-resolution-request.js";
import { executeMcpServerVanillaGenerationWorkItem } from "./source-acquisition-vanilla-generation.js";

export interface McpServerSourceAcquisitionWorkItemHandlerOptions {
  requestText: string;
  runtimeRoot?: string;
  vanillaRecipes?: SourcePackageRecipeRegistry;
  vanillaRecipeProvider?: SourcePackageRecipeProvider;
  vanillaExecuteRecipe?: SourcePackageRecipeExecutor;
  modrinthFetch?: ResolveModrinthModInput["fetch"];
  modrinthApiBaseUrl?: string;
  curseForgeApiKey?: string;
  curseForgeCredentialProvider?: () => string | undefined;
  curseForgeFetch?: ResolveCurseForgeModInput["fetch"];
  curseForgeApiBaseUrl?: string;
}

export function createMcpServerSourceAcquisitionWorkItemHandlers(
  options: McpServerSourceAcquisitionWorkItemHandlerOptions
): SourceAcquisitionWorkItemRunnerHandlers {
  return {
    jarIndex: async (item) => {
      if (!options.runtimeRoot) {
        return {
          summary: "Jar indexing needs a runtime root for private cache storage.",
          payload: {
            source: "source_acquisition_jar_index",
            status: "runtime_root_required"
          }
        };
      }

      return await indexJarWorkItem({
        runtimeRoot: options.runtimeRoot,
        sourceArchive: item.sourceArchive
      });
    },
    vanillaGeneration: async (item) => {
      if (!options.runtimeRoot) {
        return {
          summary:
            "Vanilla generation needs a runtime root for private cache storage.",
          payload: {
            source: "source_acquisition_vanilla_generation",
            status: "runtime_root_required"
          }
        };
      }

      return await executeMcpServerVanillaGenerationWorkItem({
        minecraftVersion: item.minecraftVersion,
        options: {
          runtimeRoot: options.runtimeRoot,
          recipes: options.vanillaRecipes,
          recipeProvider: options.vanillaRecipeProvider,
          executeRecipe: options.vanillaExecuteRecipe
        }
      });
    },
    remoteMetadata: async (item) => {
      if (item.source === "github") {
        return githubMetadataResult();
      }

      const request = parseExternalModRequest(options.requestText);
      const missing = collectMissingConstraints({
        ...request,
        platform: item.source
      });

      if (missing.length > 0) {
        return missingConstraintsResult(item.source, missing);
      }

      const resolvableRequest = { ...request, platform: item.source };

      if (!hasRequiredConstraints(resolvableRequest)) {
        return missingConstraintsResult(item.source, ["mod request"]);
      }

      if (item.source === "curseforge") {
        return {
          summary: "Resolved CurseForge remote metadata for source acquisition.",
          payload: {
            source: "source_acquisition_remote_metadata",
            result: await resolveCurseForgeMod({
              query: resolvableRequest.query,
              slug: resolvableRequest.slug,
              projectId: resolvableRequest.projectId,
              loader: resolvableRequest.loader,
              minecraftVersion: resolvableRequest.minecraftVersion,
              apiKey: options.curseForgeApiKey,
              credentialProvider: options.curseForgeCredentialProvider,
              fetch: options.curseForgeFetch,
              apiBaseUrl: options.curseForgeApiBaseUrl
            })
          }
        };
      }

      return {
        summary: "Resolved Modrinth remote metadata for source acquisition.",
        payload: {
          source: "source_acquisition_remote_metadata",
          result: await resolveModrinthMod({
            query: resolvableRequest.query,
            loader: resolvableRequest.loader,
            minecraftVersion: resolvableRequest.minecraftVersion,
            fetch: options.modrinthFetch,
            apiBaseUrl: options.modrinthApiBaseUrl
          })
        }
      };
    }
  };
}

async function indexJarWorkItem(input: {
  runtimeRoot: string;
  sourceArchive: string;
}): Promise<SourceAcquisitionWorkItemHandlerResult> {
  const workspaceRoot = await ensureRuntimeJarWorkspace(input);
  const result = await queryCachedModArchiveEntries({
    workspaceRoot,
    databasePath: join(
      input.runtimeRoot,
      "source-acquisition",
      "jar-entry-index.sqlite"
    ),
    limit: 8
  });

  return {
    summary: `Indexed ${result.entryCount} jar entr${result.entryCount === 1 ? "y" : "ies"}.`,
    payload: {
      source: "source_acquisition_jar_index",
      archiveCount: result.archiveCount,
      entryCount: result.entryCount,
      truncated: result.truncated,
      cache: result.cache,
      domainCounts: countEntryDomains(result.entries),
      sampleEntries: result.entries.map((entry) => ({
        domain: entry.domain,
        relativePath: entry.relativePath,
        assetKind: entry.assetKind,
        dataKind: entry.dataKind
      }))
    }
  };
}

async function ensureRuntimeJarWorkspace(input: {
  runtimeRoot: string;
  sourceArchive: string;
}): Promise<string> {
  const sourceArchive = normalize(resolve(input.sourceArchive));
  const archiveKey = createHash("sha256").update(sourceArchive).digest("hex");
  const workspaceRoot = join(
    input.runtimeRoot,
    "source-acquisition",
    "jar-workspaces",
    archiveKey
  );
  const modsDir = join(workspaceRoot, "mods");
  const linkPath = join(modsDir, basename(sourceArchive));

  await mkdir(modsDir, { recursive: true });
  await createArchiveLinkIfMissing(sourceArchive, linkPath);

  return workspaceRoot;
}

async function createArchiveLinkIfMissing(
  targetPath: string,
  linkPath: string
): Promise<void> {
  try {
    await link(targetPath, linkPath);
  } catch (error) {
    if (isFileExists(error)) {
      return;
    }
    if (isCrossDeviceLink(error)) {
      await copyFile(targetPath, linkPath);
      return;
    }

    throw error;
  }
}

function countEntryDomains(
  entries: Array<{ domain: string }>
): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.domain] = (counts[entry.domain] ?? 0) + 1;
    return counts;
  }, {});
}

function missingConstraintsResult(
  source: "modrinth" | "curseforge",
  missing: string[]
): SourceAcquisitionWorkItemHandlerResult {
  return {
    summary: `Remote metadata needs ${missing.join(", ")}.`,
    payload: {
      source: "source_acquisition_remote_metadata",
      result: {
        source,
        candidates: [],
        warnings: [
          {
            code: "needs_more_constraints",
            message:
              `Provide ${missing.join(", ")} before resolving ${source} metadata.`
          }
        ]
      }
    }
  };
}

function githubMetadataResult(): SourceAcquisitionWorkItemHandlerResult {
  return {
    summary: "GitHub source repository metadata requires a repository URL or slug.",
    payload: {
      source: "source_acquisition_remote_metadata",
      result: {
        source: "github",
        candidates: [],
        warnings: [
          {
            code: "github_repository_required",
            message:
              "Provide a GitHub repository URL or owner/name before resolving source repository metadata."
          }
        ]
      }
    }
  };
}

function isFileExists(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function isCrossDeviceLink(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EXDEV"
  );
}
