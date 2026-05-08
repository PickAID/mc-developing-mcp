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

export interface ParchmentMavenMappingProviderOptions {
  mavenBaseUrl: string;
  fetch?: (url: URL) => Promise<Response>;
}

interface ParchmentJson {
  classes?: ParchmentClass[];
}

interface ParchmentClass {
  name?: string;
  javadoc?: string[];
  fields?: ParchmentMember[];
  methods?: ParchmentMember[];
}

interface ParchmentMember {
  name?: string;
  descriptor?: string;
  javadoc?: string[];
  parameters?: ParchmentParameter[];
}

interface ParchmentParameter {
  index?: number;
  name?: string;
  javadoc?: string;
}

export function parseParchmentMappings(input: {
  content: string;
  minecraftVersion: string;
  mappingFamily: "parchment";
}): MappingIndexProviderResult {
  const parsed = JSON.parse(input.content) as ParchmentJson;
  const entries: MappingIndexProviderResult["entries"] = [];

  for (const clazz of parsed.classes ?? []) {
    if (!clazz.name) {
      continue;
    }

    const owner = normalizeClassName(clazz.name);
    entries.push({
      kind: "class",
      fromNamespace: "mojmap",
      toNamespace: "parchment",
      fromName: owner,
      toName: owner,
      javadoc: normalizedJavadoc(clazz.javadoc)
    });

    entries.push(...memberEntries(clazz.fields ?? [], owner, "field"));
    entries.push(...memberEntries(clazz.methods ?? [], owner, "method"));
  }

  return {
    provenance: {
      format: "parchment_json",
      minecraftVersion: input.minecraftVersion,
      mappingFamily: input.mappingFamily,
      fromNamespace: "mojmap",
      toNamespace: "parchment"
    },
    entries
  };
}

export function createParchmentMavenMappingIndexProvider(
  options: ParchmentMavenMappingProviderOptions
): MappingIndexProvider {
  return async (request) => {
    if (request.mappingFamily !== "parchment") {
      return unavailableParchmentResult(request, "mapping_family_unavailable");
    }

    const metadataUrl = parchmentMetadataUrl(
      options.mavenBaseUrl,
      request.minecraftVersion
    );
    const metadataResponse = await (options.fetch ?? fetch)(metadataUrl);
    if (!metadataResponse.ok) {
      throw new Error(
        `Parchment metadata download failed for ${metadataUrl.toString()}: ${metadataResponse.status} ${metadataResponse.statusText}`
      );
    }

    const parchmentVersion = selectReleaseVersion(await metadataResponse.text());
    if (!parchmentVersion) {
      return unavailableParchmentResult(request, "parchment_version_unavailable");
    }

    const artifactUrl = parchmentArtifactUrl(
      options.mavenBaseUrl,
      request.minecraftVersion,
      parchmentVersion
    );
    const artifactResponse = await (options.fetch ?? fetch)(artifactUrl);
    if (!artifactResponse.ok) {
      throw new Error(
        `Parchment artifact download failed for ${artifactUrl.toString()}: ${artifactResponse.status} ${artifactResponse.statusText}`
      );
    }

    const parsed = parseParchmentMappings({
      ...request,
      mappingFamily: "parchment",
      content: readParchmentJsonFromZip(
        Buffer.from(await artifactResponse.arrayBuffer())
      )
    });

    return {
      ...parsed,
      provenance: {
        ...(typeof parsed.provenance === "object" && parsed.provenance !== null
          ? parsed.provenance
          : {}),
        parchmentVersion,
        artifactUrl: artifactUrl.toString()
      }
    };
  };
}

function memberEntries(
  members: ParchmentMember[],
  owner: string,
  kind: "field" | "method"
): MappingIndexProviderResult["entries"] {
  return members
    .filter((member) => member.name && member.descriptor)
    .map((member) => ({
      kind,
      fromNamespace: "mojmap",
      toNamespace: "parchment",
      fromName: member.name ?? "",
      toName: member.name ?? "",
      owner,
      descriptor: member.descriptor,
      javadoc: normalizedJavadoc(member.javadoc),
      parameters: normalizedParameters(member.parameters)
    } satisfies MappingIndexProviderResult["entries"][number]));
}

function normalizedJavadoc(value: string[] | undefined): string[] | undefined {
  return value?.length ? value : undefined;
}

function normalizedParameters(
  parameters: ParchmentParameter[] | undefined
): MappingIndexProviderResult["entries"][number]["parameters"] {
  const normalized = (parameters ?? [])
    .filter(
      (parameter): parameter is Required<Pick<ParchmentParameter, "index" | "name">> &
        ParchmentParameter =>
        Number.isInteger(parameter.index) &&
        typeof parameter.name === "string" &&
        parameter.name.length > 0
    )
    .map((parameter) => ({
      index: parameter.index,
      name: parameter.name,
      javadoc: parameter.javadoc
    }));
  return normalized.length > 0 ? normalized : undefined;
}

function readParchmentJsonFromZip(bytes: Buffer): string {
  const entries = readZipCentralDirectory(bytes);
  const entry = entries.find(
    (candidate) => normalizeArchivePath(candidate.name) === "parchment.json"
  );
  if (!entry) {
    throw new Error("Parchment artifact did not contain parchment.json.");
  }
  return readZipEntryContent(bytes, entry).toString("utf-8");
}

function parchmentMetadataUrl(mavenBaseUrl: string, minecraftVersion: string): URL {
  return new URL(
    `org/parchmentmc/data/parchment-${encodeURIComponent(minecraftVersion)}/maven-metadata.xml`,
    normalizedBaseUrl(mavenBaseUrl)
  );
}

function parchmentArtifactUrl(
  mavenBaseUrl: string,
  minecraftVersion: string,
  parchmentVersion: string
): URL {
  const encodedMinecraftVersion = encodeURIComponent(minecraftVersion);
  const encodedParchmentVersion = encodeURIComponent(parchmentVersion);
  return new URL(
    [
      "org/parchmentmc/data",
      `parchment-${encodedMinecraftVersion}`,
      encodedParchmentVersion,
      `parchment-${encodedMinecraftVersion}-${encodedParchmentVersion}.zip`
    ].join("/"),
    normalizedBaseUrl(mavenBaseUrl)
  );
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function selectReleaseVersion(metadata: string): string | undefined {
  return (
    metadata.match(/<release>([^<]+)<\/release>/u)?.[1]?.trim() ??
    [...metadata.matchAll(/<version>([^<]+)<\/version>/gu)]
      .map((match) => match[1]?.trim() ?? "")
      .filter((version) => version.length > 0 && !version.includes("SNAPSHOT"))
      .at(-1)
  );
}

function unavailableParchmentResult(
  request: MappingIndexProviderRequest,
  status: string
): MappingIndexProviderResult {
  return {
    provenance: {
      format: "parchment_json",
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
