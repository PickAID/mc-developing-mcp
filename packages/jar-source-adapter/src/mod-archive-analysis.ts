import { readFile } from "node:fs/promises";

import { normalizeArchivePath, readZipCentralDirectory } from "./java-source-archive.js";

export interface ModArchivePreDecompileAnalysis {
  sourceArchive: string;
  tokenPolicy: "compact_mod_archive_pre_decompile_analysis";
  mixinConfigCount: number;
  accessWidenerCount: number;
  serviceProviderCount: number;
  classFileCount: number;
  assetFileCount: number;
  dataFileCount: number;
  needsSourceDecompileReasons: string[];
}

export async function analyzeModArchiveBeforeDecompile(input: {
  sourceArchive: string;
}): Promise<ModArchivePreDecompileAnalysis> {
  const archive = await readFile(input.sourceArchive);
  const paths = readZipCentralDirectory(archive)
    .map((entry) => normalizeArchivePath(entry.name))
    .filter((path): path is string => path !== undefined && !path.endsWith("/"));

  const summary = {
    sourceArchive: input.sourceArchive,
    tokenPolicy: "compact_mod_archive_pre_decompile_analysis" as const,
    mixinConfigCount: paths.filter(isMixinConfig).length,
    accessWidenerCount: paths.filter((path) => path.endsWith(".accesswidener"))
      .length,
    serviceProviderCount: paths.filter((path) => path.startsWith("META-INF/services/"))
      .length,
    classFileCount: paths.filter((path) => path.endsWith(".class")).length,
    assetFileCount: paths.filter((path) => path.startsWith("assets/")).length,
    dataFileCount: paths.filter((path) => path.startsWith("data/")).length
  };

  return {
    ...summary,
    needsSourceDecompileReasons: buildDecompileReasons(summary)
  };
}

function isMixinConfig(path: string): boolean {
  return path.endsWith(".mixins.json") || path.endsWith(".mixin.json");
}

function buildDecompileReasons(input: {
  mixinConfigCount: number;
  accessWidenerCount: number;
  serviceProviderCount: number;
  classFileCount: number;
}): string[] {
  return [
    ...(input.classFileCount > 0 ? ["class_files_present"] : []),
    ...(input.mixinConfigCount > 0 ? ["mixin_configs_present"] : []),
    ...(input.accessWidenerCount > 0 ? ["access_wideners_present"] : []),
    ...(input.serviceProviderCount > 0 ? ["service_providers_present"] : [])
  ];
}
