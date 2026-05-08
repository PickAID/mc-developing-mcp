import {
  readModArchiveMetadata,
  type ModArchiveMetadata
} from "minecraft-developing-mcp-jar-source-adapter";

export async function attachArchiveMetadata<T extends { sourceArchive: string }>(
  matches: T[]
): Promise<Array<T & { archiveMetadata?: ModArchiveMetadata }>> {
  const cache = new Map<string, Promise<ModArchiveMetadata | undefined>>();

  return Promise.all(
    matches.map(async (match) => {
      const archiveMetadata = await readArchiveMetadataCached(
        match.sourceArchive,
        cache
      );

      return archiveMetadata ? { ...match, archiveMetadata } : match;
    })
  );
}

function readArchiveMetadataCached(
  sourceArchive: string,
  cache: Map<string, Promise<ModArchiveMetadata | undefined>>
): Promise<ModArchiveMetadata | undefined> {
  const existing = cache.get(sourceArchive);
  if (existing) {
    return existing;
  }

  const loaded = readArchiveMetadata(sourceArchive);
  cache.set(sourceArchive, loaded);
  return loaded;
}

function readArchiveMetadata(
  sourceArchive: string
): Promise<ModArchiveMetadata | undefined> {
  return readModArchiveMetadata(sourceArchive).catch(() => undefined);
}
