import {
  resolveCurseForgeMod,
  resolveModrinthMod,
  type ResolveCurseForgeModInput,
  type ResolveModrinthModInput
} from "@mcpskill/external-mod-resolver";
import type {
  SourceAcquisitionWorkItemHandlerResult,
  SourceAcquisitionWorkItemRunnerHandlers
} from "@mcpskill/source-package-manager";

import {
  collectMissingConstraints,
  hasRequiredConstraints,
  parseExternalModRequest
} from "../external-mod/resolution/external-mod-resolution-request.js";

export interface McpServerSourceAcquisitionWorkItemHandlerOptions {
  requestText: string;
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
