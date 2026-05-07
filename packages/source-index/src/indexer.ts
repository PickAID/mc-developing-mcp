import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

import { chunkSourceText } from "./chunks.js";
import {
  extractJavaSourceMembers,
  extractJavaSourceSymbols
} from "./java-symbols.js";
import {
  buildLikePattern,
  buildMatchReasons,
  normalizeSearchTerms
} from "./query-ranking.js";
import { initializeSourceIndexSchema } from "./schema.js";
import { scanSourceIndexFiles } from "./scanner.js";
import { openSourceIndexDatabase } from "./sqlite.js";
import type {
  IndexedSourceChunk,
  IndexedSourceFile,
  ReadIndexedSourceChunkInput,
  ReadIndexedSourceFileInput,
  SourceIndexBuildInput,
  SourceIndexBuildResult,
  SourceIndexMatch,
  SourceIndexQueryInput,
  SourceIndexQueryResult
} from "./types.js";

const DEFAULT_MAX_FILES = 20_000;
const DEFAULT_MAX_BYTES_PER_FILE = 512 * 1024;
const DEFAULT_QUERY_LIMIT = 20;
const DEFAULT_READ_MAX_LINES = 120;

export async function buildSourceIndex(
  input: SourceIndexBuildInput
): Promise<SourceIndexBuildResult> {
  const scan = await scanSourceIndexFiles({
    sourceRoot: input.sourceRoot,
    databasePath: input.databasePath,
    maxFiles: input.maxFiles ?? DEFAULT_MAX_FILES,
    maxBytesPerFile: input.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE
  });

  await mkdir(dirname(input.databasePath), { recursive: true });
  await rm(input.databasePath, { force: true });

  const database = openSourceIndexDatabase(input.databasePath);
  let indexedTextFileCount = 0;
  let javaSymbolCount = 0;
  let javaMemberCount = 0;

  try {
    initializeSourceIndexSchema(database);
    database.prepare("INSERT INTO meta(key, value) VALUES (?, ?)").run(
      "package_id",
      input.packageId
    );
    database.exec("BEGIN");

    const insertFile = database.prepare(
      "INSERT INTO files(path, kind, size_bytes, sha256, package_id) VALUES (?, ?, ?, ?, ?)"
    );
    const insertText = database.prepare(
      "INSERT INTO fts_files(path, content) VALUES (?, ?)"
    );
    const insertChunk = database.prepare(
      [
        "INSERT INTO source_chunks(path, chunk_id, chunk_type, start_line, end_line, token_count, content)",
        "VALUES (?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")
    );
    const insertChunkText = database.prepare(
      "INSERT INTO fts_chunks(path, chunk_id, content) VALUES (?, ?, ?)"
    );
    const insertSymbol = database.prepare(
      "INSERT INTO java_symbols(path, package_name, simple_name, qualified_name) VALUES (?, ?, ?, ?)"
    );
    const insertMember = database.prepare(
      [
        "INSERT INTO java_members(path, package_name, owner_simple_name, owner_qualified_name,",
        "member_name, member_kind, signature, return_type, start_line, end_line)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")
    );

    for (const file of scan.files) {
      const buffer = await readFile(file.absolutePath);
      const digest = createHash("sha256").update(buffer).digest("hex");
      insertFile.run(
        file.relativePath,
        file.kind,
        file.sizeBytes,
        digest,
        input.packageId
      );

      if (!file.textIndexable) {
        continue;
      }

      const text = buffer.toString("utf8");
      insertText.run(file.relativePath, text);
      for (const chunk of chunkSourceText(text)) {
        insertChunk.run(
          file.relativePath,
          chunk.chunkId,
          chunk.chunkType,
          chunk.startLine,
          chunk.endLine,
          chunk.tokenCount,
          chunk.content
        );
        insertChunkText.run(file.relativePath, chunk.chunkId, chunk.content);
      }
      indexedTextFileCount += 1;

      if (file.kind === "java") {
        for (const symbol of extractJavaSourceSymbols(text)) {
          insertSymbol.run(
            file.relativePath,
            symbol.packageName ?? null,
            symbol.simpleName,
            symbol.qualifiedName
          );
          javaSymbolCount += 1;
        }
        for (const member of extractJavaSourceMembers(text)) {
          insertMember.run(
            file.relativePath,
            member.packageName ?? null,
            member.ownerSimpleName,
            member.ownerQualifiedName,
            member.memberName,
            member.memberKind,
            member.signature ?? null,
            member.returnType ?? null,
            member.startLine,
            member.endLine
          );
          javaMemberCount += 1;
        }
      }
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }

  return {
    databasePath: input.databasePath,
    sourceRoot: input.sourceRoot,
    packageId: input.packageId,
    fileCount: scan.files.length,
    skippedFileCount: scan.skippedFileCount,
    indexedTextFileCount,
    javaSymbolCount,
    javaMemberCount
  };
}

export function querySourceIndex(
  input: SourceIndexQueryInput
): SourceIndexQueryResult {
  const database = openSourceIndexDatabase(input.databasePath);
  const limit = input.limit ?? DEFAULT_QUERY_LIMIT;

  try {
    return {
      databasePath: input.databasePath,
      matches: selectMatches(database, input, limit)
    };
  } finally {
    database.close();
  }
}

export async function readIndexedSourceFile(
  input: ReadIndexedSourceFileInput
): Promise<IndexedSourceFile | undefined> {
  const metadata = querySourceIndex({
    databasePath: input.databasePath,
    pathLike: input.path,
    limit: 1
  }).matches[0];

  if (!metadata || metadata.path !== input.path) {
    return undefined;
  }

  const filePath = resolveInsideRoot(input.sourceRoot, input.path);
  const lines = splitContentLines(await readFile(filePath, "utf8"));
  const startLine = Math.max(1, input.startLine ?? 1);
  const maxLines = Math.max(1, input.maxLines ?? DEFAULT_READ_MAX_LINES);
  const startIndex = startLine - 1;
  const selected = lines.slice(startIndex, startIndex + maxLines);

  return {
    path: metadata.path,
    kind: metadata.kind,
    startLine,
    endLine: startLine + Math.max(0, selected.length - 1),
    totalLines: lines.length,
    content: selected.join("\n")
  };
}

export function readIndexedSourceChunk(
  input: ReadIndexedSourceChunkInput
): IndexedSourceChunk | undefined {
  const database = openSourceIndexDatabase(input.databasePath);
  const { match } = input;

  try {
    const query = match.chunkId
      ? [
          "SELECT path, chunk_id AS chunkId, start_line AS startLine,",
          "end_line AS endLine, content FROM source_chunks",
          "WHERE path = ? AND chunk_id = ? LIMIT 1"
        ].join(" ")
      : [
          "SELECT path, chunk_id AS chunkId, start_line AS startLine,",
          "end_line AS endLine, content FROM source_chunks",
          "WHERE path = ? ORDER BY start_line LIMIT 1"
        ].join(" ");
    const row = match.chunkId
      ? database.prepare(query).get(match.path, match.chunkId)
      : database.prepare(query).get(match.path);

    return row ? mapIndexedChunk(row) : undefined;
  } finally {
    database.close();
  }
}

function splitContentLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  const contentWithoutTerminatingNewline = content.replace(
    /(?:\r\n|\n|\r)$/u,
    ""
  );

  if (contentWithoutTerminatingNewline.length === 0) {
    return [""];
  }

  return contentWithoutTerminatingNewline.split(/\r\n|\n|\r/u);
}

function selectMatches(
  database: ReturnType<typeof openSourceIndexDatabase>,
  input: SourceIndexQueryInput,
  limit: number
): SourceIndexMatch[] {
  if (input.symbol) {
    return mapRows(
      database
        .prepare(
          [
            "SELECT files.path, files.kind, files.size_bytes AS sizeBytes, files.sha256,",
            "files.package_id AS packageId, java_symbols.package_name AS packageName,",
            "java_symbols.simple_name AS simpleName, java_symbols.qualified_name AS qualifiedName",
            "FROM java_symbols JOIN files ON files.path = java_symbols.path",
            "WHERE java_symbols.simple_name = ? OR java_symbols.qualified_name = ?",
            "ORDER BY files.path LIMIT ?"
          ].join(" ")
        )
        .all(input.symbol, input.symbol, limit)
    ).map((match) => ({
      ...match,
      matchReasons: buildMatchReasons({
        mode: "symbol",
        query: input.symbol ?? "",
        path: match.path
      })
    }));
  }

  if (input.member) {
    const ownerClause = input.owner
      ? "AND (java_members.owner_simple_name = ? OR java_members.owner_qualified_name = ?)"
      : "";
    const kindClause = input.memberKind
      ? "AND java_members.member_kind = ?"
      : "";
    const params = [
      input.member,
      ...(input.owner ? [input.owner, input.owner] : []),
      ...(input.memberKind ? [input.memberKind] : []),
      limit
    ];

    return mapRows(
      database
        .prepare(
          [
            "SELECT files.path, files.kind, files.size_bytes AS sizeBytes, files.sha256,",
            "files.package_id AS packageId, java_members.package_name AS packageName,",
            "java_members.owner_simple_name AS ownerSimpleName,",
            "java_members.owner_qualified_name AS ownerQualifiedName,",
            "java_members.member_name AS memberName, java_members.member_kind AS memberKind,",
            "java_members.signature AS signature, java_members.return_type AS returnType,",
            "java_members.start_line AS startLine, java_members.end_line AS endLine",
            "FROM java_members JOIN files ON files.path = java_members.path",
            `WHERE java_members.member_name = ? ${ownerClause} ${kindClause}`,
            "ORDER BY files.path, java_members.start_line LIMIT ?"
          ].join(" ")
        )
        .all(...params)
    ).map((match) => ({
      ...match,
      matchReasons: buildMatchReasons({
        mode: "symbol",
        query: input.member ?? "",
        path: match.path
      })
    }));
  }

  if (input.text) {
    const ftsMatches = selectTextMatches(database, input.text, limit);
    if (ftsMatches.length > 0) {
      return ftsMatches;
    }

    return selectLikeFallbackMatches(database, input.text, limit);
  }

  return mapRows(
    database
      .prepare(
        [
          "SELECT path, kind, size_bytes AS sizeBytes, sha256, package_id AS packageId",
          "FROM files WHERE path LIKE ? ORDER BY path LIMIT ?"
        ].join(" ")
      )
      .all(input.pathLike ?? "%", limit)
  );
}

function selectTextMatches(
  database: ReturnType<typeof openSourceIndexDatabase>,
  query: string,
  limit: number
): SourceIndexMatch[] {
  try {
    return mapRows(
      database
        .prepare(
          [
            "SELECT files.path, files.kind, files.size_bytes AS sizeBytes, files.sha256,",
            "files.package_id AS packageId, source_chunks.start_line AS startLine,",
            "source_chunks.end_line AS endLine, source_chunks.chunk_id AS chunkId",
            "FROM fts_chunks",
            "JOIN source_chunks ON source_chunks.path = fts_chunks.path",
            "  AND source_chunks.chunk_id = fts_chunks.chunk_id",
            "JOIN files ON files.path = fts_chunks.path",
            "WHERE fts_chunks MATCH ?",
            "ORDER BY bm25(fts_chunks) LIMIT ?"
          ].join(" ")
        )
        .all(buildFtsQuery(query), limit)
    ).map((match) => ({
      ...match,
      matchReasons: buildMatchReasons({
        mode: "fts_chunk",
        query,
        path: match.path
      })
    }));
  } catch {
    return [];
  }
}

function selectLikeFallbackMatches(
  database: ReturnType<typeof openSourceIndexDatabase>,
  query: string,
  limit: number
): SourceIndexMatch[] {
  return mapRows(
    database
      .prepare(
        [
          "SELECT files.path, files.kind, files.size_bytes AS sizeBytes, files.sha256,",
          "files.package_id AS packageId, source_chunks.start_line AS startLine,",
          "source_chunks.end_line AS endLine, source_chunks.chunk_id AS chunkId",
          "FROM source_chunks JOIN files ON files.path = source_chunks.path",
          "WHERE source_chunks.content LIKE ? ESCAPE '\\'",
          "ORDER BY files.path, source_chunks.start_line LIMIT ?"
        ].join(" ")
      )
      .all(buildLikePattern(query), limit)
  ).map((match) => ({
    ...match,
    matchReasons: buildMatchReasons({
      mode: "like_fallback",
      query,
      path: match.path
    })
  }));
}

function mapRows(rows: Record<string, unknown>[]): SourceIndexMatch[] {
  return rows.map((row) => ({
    path: String(row.path),
    kind: row.kind as SourceIndexMatch["kind"],
    sizeBytes: Number(row.sizeBytes),
    sha256: String(row.sha256),
    packageId: optionalString(row.packageId),
    packageName: optionalString(row.packageName),
    simpleName: optionalString(row.simpleName),
    qualifiedName: optionalString(row.qualifiedName),
    ownerSimpleName: optionalString(row.ownerSimpleName),
    ownerQualifiedName: optionalString(row.ownerQualifiedName),
    memberName: optionalString(row.memberName),
    memberKind: optionalMemberKind(row.memberKind),
    signature: optionalString(row.signature),
    returnType: optionalString(row.returnType),
    startLine: optionalNumber(row.startLine),
    endLine: optionalNumber(row.endLine),
    chunkId: optionalString(row.chunkId)
  }));
}

function mapIndexedChunk(row: Record<string, unknown>): IndexedSourceChunk {
  return {
    path: String(row.path),
    chunkId: String(row.chunkId),
    startLine: Number(row.startLine),
    endLine: Number(row.endLine),
    content: String(row.content)
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optionalMemberKind(
  value: unknown
): SourceIndexMatch["memberKind"] {
  return value === "field" || value === "constructor" || value === "method"
    ? value
    : undefined;
}

function buildFtsQuery(query: string): string {
  const terms = normalizeSearchTerms(query);
  if (terms.length === 0) {
    return `"${query.replaceAll('"', '""')}"`;
  }

  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" ");
}

function resolveInsideRoot(root: string, path: string): string {
  const resolvedRoot = normalize(resolve(root));
  const resolvedPath = normalize(resolve(join(resolvedRoot, path)));

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}/`)) {
    throw new Error(`Indexed path escapes source root: ${path}`);
  }

  return resolvedPath;
}
