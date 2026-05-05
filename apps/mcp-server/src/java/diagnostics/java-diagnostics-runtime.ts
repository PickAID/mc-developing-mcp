import { readdir, readFile } from "node:fs/promises";
import {
  isAbsolute,
  join,
  normalize,
  relative,
  resolve
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildJdtlsServiceProfile,
  createLspDiagnosticRegistry,
  createResilientJdtlsManager,
  type JdtlsInitializeResult,
  type JdtlsManager,
  type JdtlsServiceProfile,
  type LspDiagnosticRegistry,
  type ResilientJdtlsManager
} from "@mcpskill/java-jdtls-adapter";

const DEFAULT_MAX_FALLBACK_JAVA_FILES = 8;
const DEFAULT_MAX_REQUESTED_JAVA_FILES = 8;
const DEFAULT_DIAGNOSTIC_SETTLE_MS = 150;

export interface McpJavaDiagnosticsRuntime {
  prepare(
    input: McpJavaDiagnosticsPrepareInput
  ): Promise<McpJavaDiagnosticsPreparation>;
  stopAll(): Promise<void>;
}

export interface McpJavaDiagnosticsPrepareInput {
  workspaceRoot: string;
  requestText?: string;
}

export type McpJavaDiagnosticsPreparation =
  | {
      status: "ready";
      diagnostics: LspDiagnosticRegistry;
      syncedFiles: string[];
      profileStatus: JdtlsServiceProfile["status"];
    }
  | {
      status: "unavailable";
      diagnostics: LspDiagnosticRegistry;
      syncedFiles: [];
      reason: string;
      profileStatus: JdtlsServiceProfile["status"];
    };

export interface McpJavaDiagnosticsRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  maxFallbackJavaFiles?: number;
  maxRequestedJavaFiles?: number;
  diagnosticSettleMs?: number;
  buildProfile?: (input: {
    workspaceRoot: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<JdtlsServiceProfile>;
  createManager?: (input: {
    profile: JdtlsServiceProfile;
    diagnostics: LspDiagnosticRegistry;
  }) => McpJavaDiagnosticsManager;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface McpJavaDiagnosticsManager {
  start(): Promise<JdtlsInitializeResult>;
  currentManager(): Pick<JdtlsManager, "didOpenJavaFileAutoVersion"> | undefined;
  stop(): Promise<void>;
  state(): { status: string };
}

interface RuntimeEntry {
  profile: JdtlsServiceProfile;
  diagnostics: LspDiagnosticRegistry;
  manager?: McpJavaDiagnosticsManager;
  ready?: Promise<JdtlsInitializeResult>;
}

export function createMcpJavaDiagnosticsRuntime(
  options: McpJavaDiagnosticsRuntimeOptions = {}
): McpJavaDiagnosticsRuntime {
  const entries = new Map<string, RuntimeEntry>();
  const buildProfile = options.buildProfile ?? buildDefaultProfile;
  const createManager = options.createManager ?? createDefaultManager;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async prepare(input) {
      const workspaceRoot = resolve(input.workspaceRoot);
      const entry = await getOrCreateEntry({
        workspaceRoot,
        entries,
        buildProfile,
        createManager,
        env: options.env
      });

      if (entry.profile.status !== "ready" || !entry.manager || !entry.ready) {
        return unavailable(entry);
      }

      try {
        await entry.ready;
      } catch (error) {
        entries.delete(workspaceRoot);
        return unavailable(entry, error);
      }

      const syncedFiles = await syncJavaFiles({
        workspaceRoot,
        sourceRoots: entry.profile.workspaceSignals.sourceRoots,
        requestText: input.requestText ?? "",
        manager: entry.manager,
        maxFallbackJavaFiles:
          options.maxFallbackJavaFiles ?? DEFAULT_MAX_FALLBACK_JAVA_FILES,
        maxRequestedJavaFiles:
          options.maxRequestedJavaFiles ?? DEFAULT_MAX_REQUESTED_JAVA_FILES
      });

      if (syncedFiles.length > 0) {
        const settleMs =
          options.diagnosticSettleMs ?? DEFAULT_DIAGNOSTIC_SETTLE_MS;
        if (settleMs > 0) {
          await sleep(settleMs);
        }
      }

      return {
        status: "ready",
        diagnostics: entry.diagnostics,
        syncedFiles,
        profileStatus: entry.profile.status
      };
    },

    async stopAll() {
      const managers = [...entries.values()].flatMap((entry) =>
        entry.manager ? [entry.manager] : []
      );
      entries.clear();
      await Promise.all(managers.map((manager) => manager.stop()));
    }
  };
}

async function getOrCreateEntry(input: {
  workspaceRoot: string;
  entries: Map<string, RuntimeEntry>;
  buildProfile: NonNullable<McpJavaDiagnosticsRuntimeOptions["buildProfile"]>;
  createManager: NonNullable<McpJavaDiagnosticsRuntimeOptions["createManager"]>;
  env?: NodeJS.ProcessEnv;
}): Promise<RuntimeEntry> {
  const cached = input.entries.get(input.workspaceRoot);
  if (cached) {
    return cached;
  }

  const profile = await input.buildProfile({
    workspaceRoot: input.workspaceRoot,
    env: input.env
  });
  const diagnostics = createLspDiagnosticRegistry();
  const entry: RuntimeEntry = { profile, diagnostics };

  if (profile.status === "ready") {
    entry.manager = input.createManager({ profile, diagnostics });
    entry.ready = entry.manager.start();
  }

  input.entries.set(input.workspaceRoot, entry);
  return entry;
}

function unavailable(
  entry: RuntimeEntry,
  error?: unknown
): McpJavaDiagnosticsPreparation {
  return {
    status: "unavailable",
    diagnostics: entry.diagnostics,
    syncedFiles: [],
    profileStatus: entry.profile.status,
    reason: error
      ? `Java LSP failed to start: ${toErrorMessage(error)}`
      : `Java LSP profile is ${entry.profile.status}.`
  };
}

async function syncJavaFiles(input: {
  workspaceRoot: string;
  sourceRoots: readonly string[];
  requestText: string;
  manager: McpJavaDiagnosticsManager;
  maxFallbackJavaFiles: number;
  maxRequestedJavaFiles: number;
}): Promise<string[]> {
  const manager = input.manager.currentManager();
  if (!manager) {
    return [];
  }

  const files = await collectJavaFiles(input);
  const syncedFiles: string[] = [];

  for (const filePath of files) {
    const text = await readFile(filePath, "utf-8").catch(() => undefined);
    if (text === undefined) {
      continue;
    }

    manager.didOpenJavaFileAutoVersion({ filePath, text });
    syncedFiles.push(filePath);
  }

  return syncedFiles;
}

async function collectJavaFiles(input: {
  workspaceRoot: string;
  sourceRoots: readonly string[];
  requestText: string;
  maxFallbackJavaFiles: number;
  maxRequestedJavaFiles: number;
}): Promise<string[]> {
  const requested = collectRequestedJavaFiles(input);
  if (requested.length > 0) {
    return requested.slice(0, input.maxRequestedJavaFiles);
  }

  return discoverJavaFiles(input.sourceRoots, input.maxFallbackJavaFiles);
}

function collectRequestedJavaFiles(input: {
  workspaceRoot: string;
  sourceRoots: readonly string[];
  requestText: string;
}): string[] {
  const files = new Set<string>();

  for (const pathText of extractRequestedJavaPaths(input.requestText)) {
    const resolvedPath = resolveWorkspacePath(input.workspaceRoot, pathText);
    if (resolvedPath) {
      files.add(resolvedPath);
    }
  }

  for (const className of extractJavaClassReferences(input.requestText)) {
    const relativePath = `${className.replace(/\$.+$/, "").replaceAll(".", "/")}.java`;
    for (const sourceRoot of input.sourceRoots) {
      files.add(join(sourceRoot, relativePath));
    }
  }

  return [...files].filter(
    (filePath) =>
      filePath.endsWith(".java") && isWithin(input.workspaceRoot, filePath)
  );
}

function extractRequestedJavaPaths(requestText: string): string[] {
  const matches = requestText.matchAll(
    /(?:file:\/\/\/[^\s,;`"')]+?\.java|(?:\/|[A-Za-z0-9_.-]+\/)[^\s,;`"')]*?[A-Za-z_$][\w$]*\.java)\b/g
  );

  return [...new Set([...matches].map((match) => match[0]))];
}

function extractJavaClassReferences(requestText: string): string[] {
  const matches = requestText.matchAll(
    /\b(?:[a-z_][\w$]*\.)+[A-Z][\w$]*(?:\$[A-Z][\w$]*)?\b/g
  );

  return [...new Set([...matches].map((match) => match[0]))];
}

function resolveWorkspacePath(
  workspaceRoot: string,
  requestedPath: string
): string | undefined {
  let filePath = requestedPath;

  if (requestedPath.startsWith("file://")) {
    try {
      filePath = fileURLToPath(requestedPath);
    } catch {
      return undefined;
    }
  }

  const absolutePath = normalize(
    isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath)
  );

  return isWithin(workspaceRoot, absolutePath) ? absolutePath : undefined;
}

async function discoverJavaFiles(
  sourceRoots: readonly string[],
  maxFiles: number
): Promise<string[]> {
  const files: string[] = [];

  for (const sourceRoot of sourceRoots) {
    await collectJavaFilesUnder(sourceRoot, files, maxFiles);
    if (files.length >= maxFiles) {
      break;
    }
  }

  return files.slice(0, maxFiles);
}

async function collectJavaFilesUnder(
  directory: string,
  files: string[],
  maxFiles: number
): Promise<void> {
  if (files.length >= maxFiles) {
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => []
  );

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (files.length >= maxFiles) {
      return;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectJavaFilesUnder(entryPath, files, maxFiles);
    } else if (entry.isFile() && entry.name.endsWith(".java")) {
      files.push(entryPath);
    }
  }
}

function buildDefaultProfile(input: {
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<JdtlsServiceProfile> {
  return buildJdtlsServiceProfile(input);
}

function createDefaultManager(input: {
  profile: JdtlsServiceProfile;
  diagnostics: LspDiagnosticRegistry;
}): ResilientJdtlsManager {
  return createResilientJdtlsManager(input);
}

function isWithin(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
