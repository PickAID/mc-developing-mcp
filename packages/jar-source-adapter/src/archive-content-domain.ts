import type { ArchiveContentDomain } from "./archive-content.js";

export function classifyArchiveContentDomain(
  relativePath: string
): ArchiveContentDomain | undefined {
  if (relativePath.endsWith(".java")) {
    return "java";
  }
  if (relativePath.endsWith(".class")) {
    return "class";
  }
  if (relativePath.startsWith("data/")) {
    return "data";
  }
  if (relativePath.startsWith("assets/")) {
    return "assets";
  }
  if (isArchiveMetadataPath(relativePath)) {
    return "metadata";
  }

  return undefined;
}

function isArchiveMetadataPath(relativePath: string): boolean {
  return (
    /^(?:fabric|quilt)\.mod\.json$/i.test(relativePath) ||
    /^[^/]+\.mixins?\.json$/i.test(relativePath) ||
    /\.(?:accesswidener|classtweaker)$/i.test(relativePath) ||
    relativePath === "pack.mcmeta" ||
    /^META-INF\/(?:mods|neoforge\.mods)\.toml$/i.test(relativePath)
  );
}
