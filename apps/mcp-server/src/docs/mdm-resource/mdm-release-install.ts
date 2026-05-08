import { readFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  ensureMdmReleasePackageCached,
  fetchMdmReleaseManifest,
  readMdmReleaseManifestFile,
  resolveMdmResourceCacheLayout,
  type EnsureMdmReleasePackageCachedResult,
  type MdmArtifactDownloadPolicy,
  type MdmArtifactFetch,
  type MdmArtifactFetchResponse,
  type MdmReleaseFetch,
  type MdmReleaseManifest
} from "minecraft-developing-mcp-resource-registry";

export interface MdmReleaseInstallRequest {
  manifestUrl?: string;
  manifestPath?: string;
  packageId: string;
  downloadPolicy?: MdmArtifactDownloadPolicy;
}

export interface MdmReleaseInstallOptions {
  runtimeRoot: string;
  request: MdmReleaseInstallRequest;
  manifestFetch?: MdmReleaseFetch;
  artifactFetch?: MdmArtifactFetch;
  now?: () => string;
}

export type McpMdmReleaseInstallResult =
  EnsureMdmReleasePackageCachedResult & {
    manifestSource: string;
    downloadPolicy: MdmArtifactDownloadPolicy;
  };

export async function installMdmReleasePackage(
  input: MdmReleaseInstallOptions
): Promise<McpMdmReleaseInstallResult> {
  const manifest = await loadReleaseManifest(input);
  const downloadPolicy = input.request.downloadPolicy ?? "disabled";
  const result = await ensureMdmReleasePackageCached({
    manifest,
    packageId: input.request.packageId,
    cacheLayout: resolveMdmResourceCacheLayout(input.runtimeRoot),
    downloadPolicy,
    fetcher: buildArtifactFetch(input.artifactFetch),
    now: input.now
  });

  return {
    ...result,
    manifestSource: manifest.source,
    downloadPolicy
  };
}

async function loadReleaseManifest(
  input: MdmReleaseInstallOptions
): Promise<MdmReleaseManifest> {
  if (input.request.manifestPath) {
    const manifest = await readMdmReleaseManifestFile(input.request.manifestPath);

    return {
      ...manifest,
      source: pathToFileURL(input.request.manifestPath).href
    };
  }

  if (input.request.manifestUrl) {
    return fetchMdmReleaseManifest(input.request.manifestUrl, input.manifestFetch);
  }

  throw new Error("MDM release install requires manifestPath or manifestUrl.");
}

function buildArtifactFetch(customFetch?: MdmArtifactFetch): MdmArtifactFetch {
  return async (url) => {
    if (url.startsWith("file:")) {
      return readFileArtifact(url);
    }

    if (customFetch) {
      return customFetch(url);
    }

    return fetch(url);
  };
}

async function readFileArtifact(url: string): Promise<MdmArtifactFetchResponse> {
  const bytes = await readFile(fileURLToPath(url));

  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes
  };
}
