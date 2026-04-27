import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 66_000;

export interface ExtractJavaSourcesArchiveResult {
  fileCount: number;
}

export async function extractJavaSourcesArchive(input: {
  sourceArchive: string;
  targetRoot: string;
}): Promise<ExtractJavaSourcesArchiveResult> {
  const archive = await readFile(input.sourceArchive);
  const entries = readZipCentralDirectory(archive);
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.name.endsWith("/") || !entry.name.endsWith(".java")) {
      continue;
    }

    const relativePath = normalizeArchivePath(entry.name);

    if (!relativePath) {
      continue;
    }

    const content = readZipEntryContent(archive, entry);
    const targetPath = join(input.targetRoot, relativePath);

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
    fileCount += 1;
  }

  return { fileCount };
}

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export function readZipCentralDirectory(archive: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error("Invalid ZIP central directory entry.");
    }

    const flags = archive.readUInt16LE(offset + 8);

    if ((flags & 0x01) !== 0) {
      throw new Error("Encrypted ZIP entries are not supported.");
    }

    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const name = archive
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf-8");

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const start = Math.max(0, archive.length - MAX_EOCD_SEARCH);

  for (let offset = archive.length - 22; offset >= start; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("End of central directory not found in ZIP archive.");
}

export function readZipEntryContent(archive: Buffer, entry: ZipEntry): Buffer {
  const localHeaderOffset = entry.localHeaderOffset;

  if (archive.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid ZIP local header for ${entry.name}.`);
  }

  const fileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
  const extraLength = archive.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = archive.subarray(
    dataOffset,
    dataOffset + entry.compressedSize
  );

  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error(
    `Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`
  );
}

export function normalizeArchivePath(entryName: string): string | undefined {
  const normalized = normalize(entryName.replaceAll("\\", "/")).replaceAll(
    "\\",
    "/"
  );

  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.includes("/../")
  ) {
    return undefined;
  }

  return normalized;
}
