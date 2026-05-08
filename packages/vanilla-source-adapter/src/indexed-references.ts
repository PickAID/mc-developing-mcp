import { join } from "node:path";

import {
  querySourceIndex,
  readIndexedSourceChunk,
  readIndexedSourceFile,
  type SourceIndexMatch
} from "minecraft-developing-mcp-source-index";

import {
  deriveVanillaRelativePath,
  type VanillaSourceRequest
} from "./request.js";
import type { VanillaSourceReference } from "./types.js";

export async function tryResolveIndexedReferences(
  installPath: string | undefined,
  request: VanillaSourceRequest,
  sourceIndexDatabasePaths: string[],
  minecraftVersion?: string
): Promise<VanillaSourceReference[]> {
  const databasePaths = uniqueStrings([
    ...(installPath ? [join(installPath, "source-index.sqlite")] : []),
    ...sourceIndexDatabasePaths
  ]);
  const references = (
    await Promise.all(
      databasePaths.flatMap((databasePath) =>
        selectIndexedMatches(databasePath, request)
          .filter((match) => sourceIndexMatchTargetsVersion(match, minecraftVersion))
          .map((match) => readIndexedReference(installPath, databasePath, match))
      )
    )
  ).filter((reference): reference is VanillaSourceReference => reference !== undefined);

  return references.slice(0, request.maxFiles ?? 3);
}

function sourceIndexMatchTargetsVersion(
  match: SourceIndexMatch,
  minecraftVersion?: string
): boolean {
  return (
    !minecraftVersion ||
    !match.packageId ||
    match.packageId.startsWith(`minecraft-${minecraftVersion}-`)
  );
}

function selectIndexedMatches(
  databasePath: string,
  request: VanillaSourceRequest
): SourceIndexMatch[] {
  try {
    const exactRelativePath = deriveVanillaRelativePath(request);
    const exactMatches = exactRelativePath
      ? querySourceIndex({
          databasePath,
          pathLike: exactRelativePath,
          limit: 1
        }).matches.filter((match) => match.path === exactRelativePath)
      : [];

    if (exactMatches.length > 0) {
      return exactMatches.map((match) => ({
        ...match,
        matchReasons: ["path_exact"]
      }));
    }

    if (request.symbol) {
      const symbolMatches = querySourceIndex({
        databasePath,
        symbol: request.symbol,
        limit: request.maxFiles ?? 3
      }).matches;

      if (symbolMatches.length > 0) {
        return symbolMatches;
      }
    }

    const text = request.symbol ?? request.relativePath ?? request.packageHint;
    return text
      ? querySourceIndex({
          databasePath,
          text,
          limit: request.maxFiles ?? 3
        }).matches
      : [];
  } catch (error) {
    if (isFileNotFound(error)) {
      return [];
    }

    throw error;
  }
}

async function readIndexedReference(
  installPath: string | undefined,
  databasePath: string,
  match: SourceIndexMatch
): Promise<VanillaSourceReference | undefined> {
  const file = installPath
    ? await readIndexedSourceFile({
        sourceRoot: installPath,
        databasePath,
        path: match.path,
        startLine: match.startLine,
        maxLines: 120
      }).catch((error: unknown) => {
        if (isFileNotFound(error)) {
          return undefined;
        }
        throw error;
      })
    : undefined;

  if (!file || !installPath) {
    return readIndexedChunkReference(databasePath, match);
  }

  return {
    path: join(installPath, file.path),
    relativePath: file.path,
    content: file.content,
    reason: "indexed vanilla source match",
    startLine: file.startLine,
    endLine: file.endLine,
    totalLines: file.totalLines,
    chunkId: match.chunkId,
    matchReasons: match.matchReasons,
    nextReads: buildSourceReadNextReads(
      file.path,
      file.startLine,
      file.endLine
    )
  };
}

function readIndexedChunkReference(
  databasePath: string,
  match: SourceIndexMatch
): VanillaSourceReference | undefined {
  const chunk = readIndexedSourceChunk({ databasePath, match });
  if (!chunk) {
    return undefined;
  }

  return {
    path: `${databasePath}#${chunk.path}`,
    relativePath: chunk.path,
    content: chunk.content,
    reason: "indexed vanilla source chunk match",
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    totalLines: chunk.endLine,
    chunkId: chunk.chunkId,
    matchReasons: match.matchReasons,
    nextReads: buildSourceReadNextReads(
      chunk.path,
      chunk.startLine,
      chunk.endLine
    )
  };
}

function buildSourceReadNextReads(
  relativePath: string,
  startLine?: number,
  endLine?: number
): string[] {
  if (startLine === undefined || endLine === undefined) {
    return [];
  }

  return [`source.read ${relativePath}:${startLine}-${endLine}`];
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
