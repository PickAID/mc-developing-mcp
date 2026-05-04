import { stat } from "node:fs/promises";

import { classifyKind } from "./kinds.js";
import { relativePosix } from "./path-utils.js";
import { buildResourceLocations } from "./resource-location-metadata.js";
import type {
  DatapackBudget,
  DatapackDomain,
  DatapackFileEntry,
  DatapackRoot,
  DatapackRootProvenance,
  DatapackSkippedFile
} from "./types.js";

export async function createEntry(input: {
  scanRoot: string;
  contentRoot: Pick<DatapackRoot, "absolutePath" | "rootKind" | "provenance">;
  absolutePath: string;
}): Promise<DatapackFileEntry | undefined> {
  const rootRelativePath = toRootRelativePath(
    input.scanRoot,
    input.contentRoot.absolutePath
  );
  const relativePath = relativePosix(input.contentRoot.absolutePath, input.absolutePath);
  if (isPackMetadataPath(relativePath)) {
    return createPackMetadataEntry(input.absolutePath, {
      relativePath,
      rootKind: input.contentRoot.rootKind,
      provenance: input.contentRoot.provenance,
      rootRelativePath
    });
  }

  const segments = relativePath.split("/");
  const domain = segments[0] as DatapackDomain | undefined;

  if (domain !== "data" && domain !== "assets") {
    return undefined;
  }

  const namespace = segments[1];
  if (namespace === undefined || namespace.length === 0) {
    return undefined;
  }

  try {
    const fileStat = await stat(input.absolutePath);
    if (!fileStat.isFile()) {
      return undefined;
    }

    return {
      absolutePath: input.absolutePath,
      rootKind: input.contentRoot.rootKind,
      provenance: input.contentRoot.provenance,
      rootRelativePath,
      relativePath,
      namespace,
      kind: classifyKind(domain, segments[2], relativePath),
      domain,
      sizeBytes: fileStat.size,
      resourceLocations: buildResourceLocations(domain, namespace, segments)
    };
  } catch {
    return undefined;
  }
}

export function createSkipped(
  root: string,
  absolutePath: string,
  reason: DatapackSkippedFile["reason"]
): DatapackSkippedFile {
  return {
    absolutePath,
    relativePath: relativePosix(root, absolutePath),
    reason
  };
}

export function rootKindForAbsoluteRoot(
  absoluteRoot: string,
  roots: DatapackRoot[]
): DatapackRoot["rootKind"] {
  return roots.find((contentRoot) => contentRoot.absolutePath === absoluteRoot)
    ?.rootKind ?? "workspace_data_root";
}

export function provenanceForAbsoluteRoot(
  absoluteRoot: string,
  roots: DatapackRoot[]
): DatapackRootProvenance {
  return roots.find((contentRoot) => contentRoot.absolutePath === absoluteRoot)
    ?.provenance ?? "scan_root";
}

export function withinEntryLimit(
  entries: DatapackFileEntry[],
  budget: DatapackBudget
): boolean {
  return budget.limit === undefined || entries.length < budget.limit;
}

async function createPackMetadataEntry(
  absolutePath: string,
  input: {
    relativePath: string;
    rootKind: DatapackRoot["rootKind"];
    provenance: DatapackRootProvenance;
    rootRelativePath: string;
  }
): Promise<DatapackFileEntry | undefined> {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return undefined;
    }

    return {
      absolutePath,
      rootKind: input.rootKind,
      provenance: input.provenance,
      rootRelativePath: input.rootRelativePath,
      relativePath: input.relativePath,
      namespace: "",
      kind: "pack_metadata",
      domain: "assets",
      sizeBytes: fileStat.size
    };
  } catch {
    return undefined;
  }
}

function isPackMetadataPath(relativePath: string): boolean {
  return relativePath === "pack.mcmeta" || relativePath === "pack.png";
}

function toRootRelativePath(scanRoot: string, contentRoot: string): string {
  return relativePosix(scanRoot, contentRoot) || ".";
}
