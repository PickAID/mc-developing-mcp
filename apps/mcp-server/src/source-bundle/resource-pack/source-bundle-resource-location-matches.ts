import {
  listDatapackFiles,
  type DatapackFileEntry,
  type DatapackSearchMatch
} from "@mcpskill/datapack-adapter";

const DATAPACK_BUDGET = {
  maxFiles: 512,
  maxBytesPerFile: 64 * 1024
} as const;

export async function findResourceLocationEntryMatches(
  workspaceRoot: string,
  query: string
): Promise<DatapackSearchMatch[]> {
  const listed = await listDatapackFiles(workspaceRoot, { ...DATAPACK_BUDGET });

  return listed.entries.flatMap((file) =>
    entryResourceLocation(file) === query
      ? [
          {
            file,
            line: 1,
            column: 1,
            preview: `resource-location metadata: ${query}`
          }
        ]
      : []
  );
}

function entryResourceLocation(entry: DatapackFileEntry): string | undefined {
  if (entry.domain !== "assets") {
    return undefined;
  }

  const segments = entry.relativePath.split("/");
  const assetKind = segments[2];
  const path = segments.slice(3).join("/").replace(/\.(?:json|png)$/i, "");

  if (!entry.namespace || !path) {
    return undefined;
  }
  if (assetKind === "items") {
    return `${entry.namespace}:item/${path}`;
  }
  if (
    assetKind === "blockstates" ||
    assetKind === "models" ||
    assetKind === "textures"
  ) {
    return `${entry.namespace}:${path}`;
  }

  return undefined;
}
