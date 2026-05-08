import { basename } from "node:path";

import type {
  ModArchiveCandidate,
  ModArchiveMetadata,
  ModArchiveSource
} from "minecraft-developing-mcp-jar-source-adapter";

import type { LocalModArchiveInspection } from "./external-mod-local-archive-inspection.js";

export interface McpServerLocalModArchiveRequester {
  modId: string;
  title: string;
  versionNumber: string;
  loader: string;
  fileName: string;
  archivePath: string;
  relativePath: string;
  embeddedArchivePath?: string;
  archiveSource: ModArchiveSource;
  metadataPath: string;
}

export interface LocalArchiveInspectionRecord {
  archive: ModArchiveCandidate;
  inspection: LocalModArchiveInspection;
}

export function collectMetadataOwners(
  record: LocalArchiveInspectionRecord
): McpServerLocalModArchiveRequester[] {
  return [
    record.inspection.archiveMetadata
      ? buildMetadataOwner(record.archive, record.inspection.archiveMetadata)
      : undefined,
    ...record.inspection.nestedArchives.map((nested) =>
      nested.embeddedArchiveMetadata
        ? buildMetadataOwner(
            record.archive,
            nested.embeddedArchiveMetadata,
            nested.embeddedArchivePath
          )
        : undefined
    )
  ].filter((owner): owner is McpServerLocalModArchiveRequester =>
    Boolean(owner)
  );
}

export function findLoaderDependencyRequester(
  request: {
    loader?: string;
    loaderDependency?: { requestedBy?: string };
  },
  owners: McpServerLocalModArchiveRequester[]
): McpServerLocalModArchiveRequester | undefined {
  const requestedBy = request.loaderDependency?.requestedBy;

  if (!requestedBy) {
    return undefined;
  }

  return owners.find((owner) => {
    if (
      request.loader &&
      normalizeText(owner.loader) !== normalizeText(request.loader)
    ) {
      return false;
    }

    return normalizeText(owner.modId) === normalizeText(requestedBy);
  });
}

export function formatRequesterReference(
  requester: McpServerLocalModArchiveRequester
): string {
  return requester.embeddedArchivePath
    ? `${requester.relativePath}!${requester.embeddedArchivePath}`
    : requester.relativePath;
}

function buildMetadataOwner(
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata,
  embeddedArchivePath?: string
): McpServerLocalModArchiveRequester {
  return {
    modId: metadata.modId,
    title: metadata.name ?? metadata.modId,
    versionNumber: metadata.version ?? "unknown",
    loader: metadata.loader,
    fileName: basename(embeddedArchivePath ?? archive.archivePath),
    archivePath: archive.archivePath,
    relativePath: archive.relativePath,
    embeddedArchivePath,
    archiveSource: archive.source,
    metadataPath: metadata.metadataPath
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
