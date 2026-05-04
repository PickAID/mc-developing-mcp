import type { DatapackDomain, DatapackFileEntry } from "./types.js";

export function findInResourceLocationMetadata(
  entry: DatapackFileEntry,
  query: string
) {
  const normalizedQuery = query.toLowerCase();
  if (!entry.resourceLocations?.includes(normalizedQuery)) {
    return undefined;
  }

  return {
    line: 1,
    column: 1,
    preview: `resource-location metadata: ${normalizedQuery}`
  };
}

export function buildResourceLocations(
  domain: DatapackDomain,
  namespace: string,
  segments: string[]
): string[] | undefined {
  if (domain !== "assets") {
    return undefined;
  }

  const assetKind = segments[2];
  const pathSegments = segments.slice(3);
  const path = stripKnownExtension(pathSegments.join("/"));
  if (!path) {
    return undefined;
  }

  if (assetKind === "items") {
    return [`${namespace}:item/${path}`];
  }

  if (assetKind === "models" || assetKind === "textures") {
    return [`${namespace}:${path}`];
  }

  return undefined;
}

function stripKnownExtension(path: string): string {
  return path.replace(/\.(?:json|png|mcmeta|txt|fsh|vsh)$/i, "").toLowerCase();
}
