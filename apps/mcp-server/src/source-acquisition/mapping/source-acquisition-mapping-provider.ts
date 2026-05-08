import {
  normalizeArchivePath,
  readZipCentralDirectory,
  readZipEntryContent
} from "minecraft-developing-mcp-jar-source-adapter";

import type {
  MappingIndexProvider,
  MappingIndexProviderRequest,
  MappingIndexProviderResult
} from "./source-acquisition-mapping-index.js";

export interface TinyV2MappingParseInput extends MappingIndexProviderRequest {
  content: string;
  fromNamespace?: string;
  toNamespace?: string;
}

export interface TinyV2MappingProviderOptions {
  resolveUrl: (request: MappingIndexProviderRequest) => string | undefined;
  fetch?: (url: URL) => Promise<Response>;
  fromNamespace?: string;
  toNamespace?: string;
}

export interface YarnMavenTinyV2MappingProviderOptions {
  mavenBaseUrl: string;
  fetch?: (url: URL) => Promise<Response>;
  fromNamespace?: string;
  toNamespace?: string;
}

export function parseTinyV2Mappings(
  input: TinyV2MappingParseInput
): MappingIndexProviderResult {
  const lines = input.content.split(/\r?\n/u);
  const header = parseTinyHeader(lines[0]);
  const fromIndex = namespaceIndex(
    header.namespaces,
    input.fromNamespace ?? header.namespaces[0]
  );
  const toIndex = namespaceIndex(
    header.namespaces,
    input.toNamespace ?? header.namespaces.at(-1)
  );
  const entries: MappingIndexProviderResult["entries"] = [];
  let currentOwner: string | undefined;

  for (const rawLine of lines.slice(1)) {
    if (rawLine.trim().length === 0) {
      continue;
    }

    const depth = rawLine.match(/^\t*/u)?.[0].length ?? 0;
    const columns = rawLine.trimStart().split("\t");
    if (depth === 0 && columns[0] === "c") {
      const names = columns.slice(1);
      const fromName = names[fromIndex];
      const toName = names[toIndex];
      if (!fromName || !toName) {
        currentOwner = undefined;
        continue;
      }
      const normalizedFromName = normalizeClassName(fromName);
      const normalizedToName = normalizeClassName(toName);
      currentOwner = normalizedToName;
      entries.push({
        kind: "class",
        fromNamespace: header.namespaces[fromIndex],
        toNamespace: header.namespaces[toIndex],
        fromName: normalizedFromName,
        toName: normalizedToName
      });
      continue;
    }

    if (depth === 1 && (columns[0] === "f" || columns[0] === "m")) {
      const descriptor = columns[1];
      const names = columns.slice(2);
      const fromName = names[fromIndex];
      const toName = names[toIndex];
      if (!descriptor || !fromName || !toName) {
        continue;
      }
      entries.push({
        kind: columns[0] === "f" ? "field" : "method",
        fromNamespace: header.namespaces[fromIndex],
        toNamespace: header.namespaces[toIndex],
        fromName,
        toName,
        owner: currentOwner,
        descriptor
      });
    }
  }

  return {
    provenance: {
      format: "tiny_v2",
      minecraftVersion: input.minecraftVersion,
      mappingFamily: input.mappingFamily,
      fromNamespace: header.namespaces[fromIndex],
      toNamespace: header.namespaces[toIndex]
    },
    entries
  };
}

export function createTinyV2MappingIndexProvider(
  options: TinyV2MappingProviderOptions
): MappingIndexProvider {
  return async (request) => {
    const resolvedUrl = options.resolveUrl(request);
    if (!resolvedUrl) {
      return {
        provenance: {
          format: "tiny_v2",
          status: "url_unavailable",
          minecraftVersion: request.minecraftVersion,
          mappingFamily: request.mappingFamily
        },
        entries: []
      };
    }

    const url = new URL(resolvedUrl);
    const response = await (options.fetch ?? fetch)(url);
    if (!response.ok) {
      throw new Error(
        `Mapping download failed for ${url.toString()}: ${response.status} ${response.statusText}`
      );
    }

    return parseTinyV2Mappings({
      ...request,
      fromNamespace: options.fromNamespace,
      toNamespace: options.toNamespace,
      content: await readMappingContent(response)
    });
  };
}

export function createYarnMavenTinyV2MappingIndexProvider(
  options: YarnMavenTinyV2MappingProviderOptions
): MappingIndexProvider {
  return async (request) => {
    if (request.mappingFamily !== "yarn") {
      return unavailableYarnMavenResult(request, "mapping_family_unavailable");
    }

    const metadataUrl = yarnMetadataUrl(options.mavenBaseUrl);
    const metadataResponse = await (options.fetch ?? fetch)(metadataUrl);
    if (!metadataResponse.ok) {
      throw new Error(
        `Yarn Maven metadata download failed for ${metadataUrl.toString()}: ${metadataResponse.status} ${metadataResponse.statusText}`
      );
    }

    const metadata = await metadataResponse.text();
    const yarnVersion = selectHighestYarnBuild(
      extractMavenMetadataVersions(metadata),
      request.minecraftVersion
    );
    if (!yarnVersion) {
      return unavailableYarnMavenResult(request, "yarn_version_unavailable");
    }

    const artifactUrl = yarnArtifactUrl(options.mavenBaseUrl, yarnVersion);
    const artifactResponse = await (options.fetch ?? fetch)(artifactUrl);
    if (!artifactResponse.ok) {
      throw new Error(
        `Yarn mapping artifact download failed for ${artifactUrl.toString()}: ${artifactResponse.status} ${artifactResponse.statusText}`
      );
    }

    const parsed = parseTinyV2Mappings({
      ...request,
      fromNamespace: options.fromNamespace,
      toNamespace: options.toNamespace,
      content: await readMappingContent(artifactResponse)
    });

    return {
      ...parsed,
      provenance: {
        ...(typeof parsed.provenance === "object" && parsed.provenance !== null
          ? parsed.provenance
          : {}),
        yarnVersion,
        artifactUrl: artifactUrl.toString()
      }
    };
  };
}

async function readMappingContent(response: Response): Promise<string> {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (looksLikeZip(bytes)) {
    return readTinyMappingFromZip(bytes);
  }
  return bytes.toString("utf-8");
}

function looksLikeZip(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
}

function readTinyMappingFromZip(bytes: Buffer): string {
  const entries = readZipCentralDirectory(bytes);
  const normalizedEntries = entries.map((entry) => ({
    entry,
    relativePath: normalizeArchivePath(entry.name)
  }));
  const entry =
    normalizedEntries.find(
      (candidate) => candidate.relativePath === "mappings/mappings.tiny"
    )?.entry ??
    normalizedEntries.find(
      (candidate) => candidate.relativePath?.endsWith(".tiny") === true
    )?.entry;

  if (!entry) {
    throw new Error("Tiny mapping artifact did not contain a .tiny file.");
  }

  return readZipEntryContent(bytes, entry).toString("utf-8");
}

function yarnMetadataUrl(mavenBaseUrl: string): URL {
  return new URL("net/fabricmc/yarn/maven-metadata.xml", normalizedBaseUrl(mavenBaseUrl));
}

function yarnArtifactUrl(mavenBaseUrl: string, yarnVersion: string): URL {
  const encodedVersion = encodeURIComponent(yarnVersion);
  return new URL(
    `net/fabricmc/yarn/${encodedVersion}/yarn-${encodedVersion}-v2.jar`,
    normalizedBaseUrl(mavenBaseUrl)
  );
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function extractMavenMetadataVersions(metadata: string): string[] {
  return [...metadata.matchAll(/<version>([^<]+)<\/version>/gu)].map(
    (match) => match[1]?.trim() ?? ""
  );
}

function selectHighestYarnBuild(
  versions: string[],
  minecraftVersion: string
): string | undefined {
  const prefix = `${minecraftVersion}+build.`;
  return versions
    .map((version) => ({
      version,
      build: version.startsWith(prefix)
        ? Number.parseInt(version.slice(prefix.length), 10)
        : Number.NaN
    }))
    .filter((candidate) => Number.isSafeInteger(candidate.build))
    .sort((left, right) => right.build - left.build)[0]?.version;
}

function unavailableYarnMavenResult(
  request: MappingIndexProviderRequest,
  status: string
): MappingIndexProviderResult {
  return {
    provenance: {
      format: "tiny_v2",
      status,
      minecraftVersion: request.minecraftVersion,
      mappingFamily: request.mappingFamily
    },
    cacheable: false,
    entries: []
  };
}

function normalizeClassName(name: string): string {
  return name.replaceAll("/", ".");
}

function parseTinyHeader(line: string | undefined): { namespaces: string[] } {
  const columns = line?.split("\t") ?? [];
  if (columns[0] !== "tiny" || columns[1] !== "2") {
    throw new Error("Expected Tiny v2 mapping header.");
  }

  const namespaces = columns.slice(3);
  if (namespaces.length < 2 || namespaces.some((name) => name.length === 0)) {
    throw new Error("Tiny v2 mapping header must declare at least two namespaces.");
  }

  return { namespaces };
}

function namespaceIndex(namespaces: string[], namespace: string | undefined): number {
  const index = namespace ? namespaces.indexOf(namespace) : -1;
  if (index === -1) {
    throw new Error(`Tiny mapping namespace ${namespace ?? "<missing>"} was not found.`);
  }
  return index;
}
