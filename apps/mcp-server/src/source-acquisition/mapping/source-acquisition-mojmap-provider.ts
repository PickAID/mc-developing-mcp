import type {
  MappingIndexProvider,
  MappingIndexProviderRequest,
  MappingIndexProviderResult
} from "./source-acquisition-mapping-index.js";

export interface MojangManifestMappingProviderOptions {
  versionManifestUrl: string;
  fetch?: (url: URL) => Promise<Response>;
  sides?: Array<"client" | "server">;
}

interface MojangVersionManifest {
  versions?: Array<{
    id?: string;
    url?: string;
  }>;
}

interface MojangVersionMetadata {
  downloads?: {
    client_mappings?: {
      url?: string;
    };
    server_mappings?: {
      url?: string;
    };
  };
}

export function parseProguardMappings(input: {
  content: string;
  minecraftVersion: string;
  mappingFamily: "mojmap";
}): MappingIndexProviderResult {
  const entries: MappingIndexProviderResult["entries"] = [];
  let owner: string | undefined;

  for (const rawLine of input.content.split(/\r?\n/u)) {
    if (rawLine.trim().length === 0 || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const classMatch = rawLine.match(/^(\S+) -> (\S+):$/u);
    if (classMatch) {
      owner = classMatch[1];
      entries.push({
        kind: "class",
        fromNamespace: "official",
        toNamespace: "mojmap",
        fromName: classMatch[2] ?? "",
        toName: owner
      });
      continue;
    }

    const member = parseProguardMember(rawLine, owner);
    if (member) {
      entries.push(member);
    }
  }

  return {
    provenance: {
      format: "proguard",
      minecraftVersion: input.minecraftVersion,
      mappingFamily: input.mappingFamily,
      fromNamespace: "official",
      toNamespace: "mojmap"
    },
    entries
  };
}

export function createMojangManifestMappingIndexProvider(
  options: MojangManifestMappingProviderOptions
): MappingIndexProvider {
  return async (request) => {
    if (request.mappingFamily !== "mojmap") {
      return unavailableMojmapResult(request, "mapping_family_unavailable");
    }

    const manifestUrl = new URL(options.versionManifestUrl);
    const manifestResponse = await (options.fetch ?? fetch)(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(
        `Mojang version manifest download failed for ${manifestUrl.toString()}: ${manifestResponse.status} ${manifestResponse.statusText}`
      );
    }

    const versionUrl = selectVersionMetadataUrl(
      await readJson<MojangVersionManifest>(manifestResponse),
      request.minecraftVersion
    );
    if (!versionUrl) {
      return unavailableMojmapResult(request, "mojang_version_unavailable");
    }

    const versionResponse = await (options.fetch ?? fetch)(new URL(versionUrl));
    if (!versionResponse.ok) {
      throw new Error(
        `Mojang version metadata download failed for ${versionUrl}: ${versionResponse.status} ${versionResponse.statusText}`
      );
    }

    const mappingUrls = selectMappingUrls(
      await readJson<MojangVersionMetadata>(versionResponse),
      options.sides ?? ["client", "server"]
    );
    if (mappingUrls.length === 0) {
      return unavailableMojmapResult(request, "mojmap_mappings_unavailable");
    }

    const results = await Promise.all(
      mappingUrls.map(async (url) =>
        parseProguardMappings({
          ...request,
          mappingFamily: "mojmap",
          content: await downloadText(url, options.fetch)
        })
      )
    );

    return {
      provenance: {
        format: "proguard",
        minecraftVersion: request.minecraftVersion,
        mappingFamily: request.mappingFamily,
        fromNamespace: "official",
        toNamespace: "mojmap",
        versionUrl,
        artifactUrls: mappingUrls
      },
      entries: results.flatMap((result) => result.entries)
    };
  };
}

function parseProguardMember(
  rawLine: string,
  owner: string | undefined
): MappingIndexProviderResult["entries"][number] | undefined {
  if (!owner) {
    return undefined;
  }

  const line = stripLineNumbers(rawLine.trim());
  const match = line.match(/^(.+) (\S+?)(?:\((.*)\)(?::\d+:\d+)?)? -> (\S+)$/u);
  if (!match) {
    return undefined;
  }

  const type = match[1]?.trim();
  const name = match[2];
  const args = match[3];
  const obfuscatedName = match[4];
  if (!type || !name || !obfuscatedName) {
    return undefined;
  }

  return {
    kind: args === undefined ? "field" : "method",
    fromNamespace: "official",
    toNamespace: "mojmap",
    fromName: obfuscatedName,
    toName: name,
    owner,
    descriptor:
      args === undefined
        ? typeDescriptor(type)
        : `(${splitArguments(args).map(typeDescriptor).join("")})${typeDescriptor(type)}`
  };
}

function stripLineNumbers(line: string): string {
  return line.replace(/^(?:\d+:){1,2}/u, "");
}

function splitArguments(args: string): string[] {
  const trimmed = args.trim();
  return trimmed.length === 0
    ? []
    : trimmed.split(",").map((arg) => arg.trim()).filter(Boolean);
}

function typeDescriptor(type: string): string {
  const trimmed = type.trim();
  if (trimmed.endsWith("[]")) {
    return `[${typeDescriptor(trimmed.slice(0, -2))}`;
  }

  const primitive = primitiveDescriptor(trimmed);
  return primitive ?? `L${trimmed.replaceAll(".", "/")};`;
}

function primitiveDescriptor(type: string): string | undefined {
  return {
    boolean: "Z",
    byte: "B",
    char: "C",
    double: "D",
    float: "F",
    int: "I",
    long: "J",
    short: "S",
    void: "V"
  }[type];
}

function selectVersionMetadataUrl(
  manifest: MojangVersionManifest,
  minecraftVersion: string
): string | undefined {
  return manifest.versions?.find((version) => version.id === minecraftVersion)?.url;
}

function selectMappingUrls(
  metadata: MojangVersionMetadata,
  sides: Array<"client" | "server">
): string[] {
  return sides
    .map((side) =>
      side === "client"
        ? metadata.downloads?.client_mappings?.url
        : metadata.downloads?.server_mappings?.url
    )
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function downloadText(
  url: string,
  fetcher: ((url: URL) => Promise<Response>) | undefined
): Promise<string> {
  const response = await (fetcher ?? fetch)(new URL(url));
  if (!response.ok) {
    throw new Error(
      `Mojmap mapping download failed for ${url}: ${response.status} ${response.statusText}`
    );
  }
  return response.text();
}

function unavailableMojmapResult(
  request: MappingIndexProviderRequest,
  status: string
): MappingIndexProviderResult {
  return {
    provenance: {
      format: "proguard",
      status,
      minecraftVersion: request.minecraftVersion,
      mappingFamily: request.mappingFamily
    },
    cacheable: false,
    entries: []
  };
}
