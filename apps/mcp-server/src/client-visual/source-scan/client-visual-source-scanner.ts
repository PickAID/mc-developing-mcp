import { opendir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import type { WorkspaceDescriptor } from "minecraft-developing-mcp-shared-types";

import {
  CLIENT_VISUAL_SOURCE_PATTERNS,
  type ClientVisualPatternKind,
  type ClientVisualSourcePattern
} from "./client-visual-source-patterns.js";

export interface ClientVisualSourceScannerOptions {
  workspaceRoot: string;
  descriptor?: WorkspaceDescriptor;
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxEntriesPerKind?: number;
}

export interface ClientVisualSourceEvidence {
  kind: ClientVisualSourceEvidenceKind;
  file: string;
  line: number;
  language: "java" | "kubejs";
  symbol?: string;
  value?: string;
}

export type ClientVisualSourceEvidenceKind =
  | "candidateRegistries"
  | "candidateClientInit"
  | "candidateRendererBindings"
  | "candidateScreenRegistrations"
  | "candidateModelLayerRegistrations"
  | "resourceLocationReferences"
  | "kubeJsClientHooks"
  | "dynamicTextureHints"
  | "resourceReloadHooks"
  | "networkSyncHints"
  | "animationStateHints"
  | "uiLayoutHints"
  | "renderPipelineHints"
  | "shaderPipelineHints"
  | "renderPerformanceRisks";

export interface ClientVisualSourceScan {
  tokenPolicy: "compact_client_visual_source_scan";
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  counts: Record<ClientVisualSourceEvidenceKind, number>;
  evidence: ClientVisualSourceEvidence[];
}

const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_BYTES_PER_FILE = 32 * 1024;
const DEFAULT_MAX_ENTRIES_PER_KIND = 8;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".mcpskill",
  "build",
  "dist",
  "node_modules",
  "out",
  "target"
]);

export async function scanClientVisualSourceEvidence(
  options: ClientVisualSourceScannerOptions
): Promise<ClientVisualSourceScan> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const maxFiles = normalizeLimit(options.maxFiles, DEFAULT_MAX_FILES);
  const maxBytesPerFile = normalizeLimit(
    options.maxBytesPerFile,
    DEFAULT_MAX_BYTES_PER_FILE
  );
  const maxEntriesPerKind = normalizeLimit(
    options.maxEntriesPerKind,
    DEFAULT_MAX_ENTRIES_PER_KIND
  );
  const result = emptyScan();
  const files = await collectSourceFiles(workspaceRoot, maxFiles);

  result.truncated = files.truncated;
  result.skippedFiles = files.skippedFiles;

  for (const file of files.paths) {
    const content = await readSourceWithinBudget(file.absolutePath, maxBytesPerFile);
    if (content === undefined) {
      result.skippedFiles += 1;
      result.truncated = true;
      continue;
    }

    result.scannedFiles += 1;
    scanFile({
      result,
      file: file.relativePath,
      language: file.language,
      content,
      maxEntriesPerKind
    });
  }

  return result;
}

function emptyScan(): ClientVisualSourceScan {
  return {
    tokenPolicy: "compact_client_visual_source_scan",
    scannedFiles: 0,
    skippedFiles: 0,
    truncated: false,
    counts: {
      candidateRegistries: 0,
      candidateClientInit: 0,
      candidateRendererBindings: 0,
      candidateScreenRegistrations: 0,
      candidateModelLayerRegistrations: 0,
      resourceLocationReferences: 0,
      kubeJsClientHooks: 0,
      dynamicTextureHints: 0,
      resourceReloadHooks: 0,
      networkSyncHints: 0,
      animationStateHints: 0,
      uiLayoutHints: 0,
      renderPipelineHints: 0,
      shaderPipelineHints: 0,
      renderPerformanceRisks: 0
    },
    evidence: []
  };
}

async function collectSourceFiles(
  workspaceRoot: string,
  maxFiles: number
): Promise<{
  paths: Array<{ absolutePath: string; relativePath: string; language: "java" | "kubejs" }>;
  skippedFiles: number;
  truncated: boolean;
}> {
  const paths: Array<{
    absolutePath: string;
    relativePath: string;
    language: "java" | "kubejs";
  }> = [];
  let skippedFiles = 0;
  let truncated = false;

  async function walk(directory: string): Promise<void> {
    if (paths.length >= maxFiles) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await sortedDirectoryEntries(directory);
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = toPosix(relative(workspaceRoot, absolutePath));
      const language = sourceLanguage(relativePath);
      if (!language) {
        continue;
      }

      if (paths.length >= maxFiles) {
        skippedFiles += 1;
        truncated = true;
        continue;
      }

      paths.push({ absolutePath, relativePath, language });
    }
  }

  await walk(workspaceRoot);
  return { paths, skippedFiles, truncated };
}

async function sortedDirectoryEntries(directory: string) {
  const directoryHandle = await opendir(directory);
  const entries = [];

  for await (const entry of directoryHandle) {
    entries.push(entry);
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function sourceLanguage(relativePath: string): "java" | "kubejs" | undefined {
  if (extname(relativePath) === ".java") {
    return "java";
  }

  if (
    relativePath.startsWith("kubejs/") &&
    (relativePath.endsWith(".js") || relativePath.endsWith(".ts"))
  ) {
    return "kubejs";
  }

  return undefined;
}

async function readSourceWithinBudget(
  filePath: string,
  maxBytesPerFile: number
): Promise<string | undefined> {
  try {
    const details = await stat(filePath);
    if (!details.isFile() || details.size > maxBytesPerFile) {
      return undefined;
    }

    const content = await readFile(filePath);
    if (content.includes(0)) {
      return undefined;
    }

    return content.toString("utf-8");
  } catch {
    return undefined;
  }
}

function scanFile(input: {
  result: ClientVisualSourceScan;
  file: string;
  language: "java" | "kubejs";
  content: string;
  maxEntriesPerKind: number;
}): void {
  for (const [kind, patterns] of Object.entries(
    CLIENT_VISUAL_SOURCE_PATTERNS
  ) as Array<[ClientVisualPatternKind, ReadonlyArray<ClientVisualSourcePattern>]>) {
    const match = firstPatternMatch(input.content, patterns);
    if (!match) {
      continue;
    }

    addEvidence(input, {
      kind,
      line: lineNumberAt(input.content, match.index),
      symbol: match.symbol
    });
  }

  scanResourceLocations(input);
}

function firstPatternMatch(
  content: string,
  patterns: ReadonlyArray<{ symbol: string; pattern: RegExp }>
): { symbol: string; index: number } | undefined {
  for (const { symbol, pattern } of patterns) {
    const match = pattern.exec(content);
    pattern.lastIndex = 0;
    if (!match || match.index === undefined) {
      continue;
    }

    return { symbol, index: match.index };
  }

  return undefined;
}

function scanResourceLocations(input: {
  result: ClientVisualSourceScan;
  file: string;
  language: "java" | "kubejs";
  content: string;
  maxEntriesPerKind: number;
}): void {
  const seen = new Set<string>();
  const addReference = (value: string, index: number): void => {
    if (seen.has(value)) {
      return;
    }

    seen.add(value);
    addEvidence(input, {
      kind: "resourceLocationReferences",
      line: lineNumberAt(input.content, index),
      value
    });
  };

  for (const match of input.content.matchAll(
    /\b(?:ResourceLocation\.fromNamespaceAndPath|new ResourceLocation)\(\s*["']([a-z0-9_.-]+)["']\s*,\s*["']([a-z0-9_./-]+)["']/g
  )) {
    addReference(`${match[1]}:${match[2]}`, match.index ?? 0);
  }

  for (const match of input.content.matchAll(
    /["']([a-z0-9_.-]+:[a-z0-9_./-]+)["']/g
  )) {
    addReference(match[1] ?? "", match.index ?? 0);
  }
}

function addEvidence(
  input: {
    result: ClientVisualSourceScan;
    file: string;
    language: "java" | "kubejs";
    maxEntriesPerKind: number;
  },
  entry: Pick<ClientVisualSourceEvidence, "kind" | "line" | "symbol" | "value">
): void {
  input.result.counts[entry.kind] += 1;

  const entriesForKind = input.result.evidence.filter(
    (evidence) => evidence.kind === entry.kind
  );
  if (entriesForKind.length >= input.maxEntriesPerKind) {
    return;
  }

  input.result.evidence.push({
    kind: entry.kind,
    file: input.file,
    line: entry.line,
    language: input.language,
    symbol: entry.symbol,
    value: entry.value
  });
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (content.charCodeAt(position) === 10) {
      line += 1;
    }
  }
  return line;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}
