import { open, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LspDiagnostic,
  LspDiagnosticRegistry,
  LspPublishDiagnosticsParams
} from "@mcpskill/java-jdtls-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutor,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import type { McpJavaDiagnosticsPreparation } from "./java-diagnostics-runtime.js";

const MAX_LOG_FILES = 4;
const MAX_LOG_BYTES = 256 * 1024;
const MAX_STACK_FRAMES = 24;
const IGNORED_ACTIONABLE_PREFIXES = [
  "java.",
  "javax.",
  "jdk.",
  "sun.",
  "net.minecraft.",
  "com.mojang."
];

export interface McpServerWorkspaceAnalyzeExecutorOptions {
  lspDiagnostics?: LspDiagnosticRegistry;
  javaDiagnosticsPreparation?: McpJavaDiagnosticsPreparation;
}

export function buildMcpServerWorkspaceAnalyzeExecutor(
  options: McpServerWorkspaceAnalyzeExecutorOptions = {}
): McpServerEvidenceExecutor {
  return (input) => executeWorkspaceAnalyze(input, options);
}

export async function executeMcpServerWorkspaceAnalyze(
  input: McpServerEvidenceExecutorInput
): Promise<McpServerEvidenceExecutorResult> {
  return executeWorkspaceAnalyze(input, {});
}

async function executeWorkspaceAnalyze(
  input: McpServerEvidenceExecutorInput,
  options: McpServerWorkspaceAnalyzeExecutorOptions
): Promise<McpServerEvidenceExecutorResult> {
  if (input.candidate.routeStep === "java_diagnostics") {
    return executeJavaDiagnosticsAnalyze(input, options);
  }

  if (input.candidate.routeStep !== "log_files") {
    return {
      matched: false,
      summary: `workspace.analyze executor cannot handle ${input.candidate.routeStep}.`
    };
  }

  const logPaths = collectLogPaths(input).slice(0, MAX_LOG_FILES);
  if (logPaths.length === 0) {
    return {
      matched: false,
      summary: "No workspace log files were discovered."
    };
  }

  const analyzedLogs = await Promise.all(logPaths.map(analyzeLogFile));
  const signals = mergeLogSignals(analyzedLogs);
  const matched = signals.actionableClassReferences.length > 0;

  return {
    matched,
    summary: matched
      ? `Extracted ${signals.actionableClassReferences.length} actionable crash class reference(s) from ${analyzedLogs.length} log file(s).`
      : `Analyzed ${analyzedLogs.length} log file(s), but no actionable crash class references were found.`,
    payload: {
      source: "workspace_analyze",
      mode: "log_files",
      logFiles: analyzedLogs.map((log) => log.summary),
      signals,
      truncated: analyzedLogs.some((log) => log.summary.truncated)
    }
  };
}

function executeJavaDiagnosticsAnalyze(
  input: McpServerEvidenceExecutorInput,
  options: McpServerWorkspaceAnalyzeExecutorOptions
): McpServerEvidenceExecutorResult {
  if (options.javaDiagnosticsPreparation?.status === "unavailable") {
    return {
      matched: false,
      summary: `Java diagnostics unavailable: ${options.javaDiagnosticsPreparation.reason}`,
      payload: {
        source: "workspace_analyze",
        mode: "java_diagnostics",
        status: "unavailable",
        profileStatus: options.javaDiagnosticsPreparation.profileStatus,
        reason: options.javaDiagnosticsPreparation.reason,
        totalDiagnostics: 0,
        files: [],
        truncated: false
      }
    };
  }

  if (!options.lspDiagnostics) {
    return {
      matched: false,
      summary: "No Java LSP diagnostic registry is attached."
    };
  }

  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.descriptor.root;
  if (!workspaceRoot) {
    return {
      matched: false,
      summary: "No workspace root is available for Java LSP diagnostics."
    };
  }

  const pending = options.lspDiagnostics.drainPending((entry) =>
    isFileUriInsideWorkspace(entry.uri, workspaceRoot)
  );
  const files = pending
    .filter((entry) => entry.diagnostics.length > 0)
    .map(toDiagnosticFile);
  const totalDiagnostics = files.reduce(
    (total, file) => total + file.diagnosticCount,
    0
  );

  if (totalDiagnostics === 0) {
    return {
      matched: false,
      summary: "No pending Java LSP diagnostics were available."
    };
  }

  return {
    matched: true,
    summary: `Drained ${totalDiagnostics} pending Java LSP diagnostic(s) from ${files.length} file(s).`,
    payload: {
      source: "workspace_analyze",
      mode: "java_diagnostics",
      totalDiagnostics,
      files,
      truncated: files.some((file) => file.truncated)
    }
  };
}

function isFileUriInsideWorkspace(uri: string, workspaceRoot: string): boolean {
  let filePath: string;

  try {
    filePath = fileURLToPath(uri);
  } catch {
    return false;
  }

  const relativePath = relative(workspaceRoot, filePath);
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

function collectLogPaths(input: McpServerEvidenceExecutorInput): string[] {
  const descriptor =
    input.requestPlan.requestContext.workspaceContext?.descriptor;
  return unique([
    ...(descriptor?.logPaths ?? []),
    ...input.candidate.pathHints.filter((path) => !path.includes(":"))
  ]);
}

async function analyzeLogFile(path: string): Promise<AnalyzedLogFile> {
  const details = await stat(path);
  const readBytes = Math.min(details.size, MAX_LOG_BYTES);
  const offset = Math.max(0, details.size - readBytes);
  const handle = await open(path, "r");

  try {
    const buffer = Buffer.alloc(readBytes);
    await handle.read(buffer, 0, readBytes, offset);
    const content = buffer.toString("utf-8");
    const parsed = parseCrashSignals(content);

    return {
      summary: {
        path,
        sizeBytes: details.size,
        readBytes,
        signalCount:
          parsed.exceptionClasses.length + parsed.classReferences.length,
        truncated: offset > 0
      },
      signals: parsed
    };
  } finally {
    await handle.close();
  }
}

function parseCrashSignals(content: string): CrashSignals {
  const exceptionClasses = unique(extractExceptionClasses(content));
  const stackFrames = content
    .split(/\r?\n/)
    .map(parseStackFrame)
    .filter((frame): frame is CrashStackFrame => frame !== undefined)
    .slice(0, MAX_STACK_FRAMES);
  const classReferences = unique(stackFrames.map((frame) => frame.className));
  const actionableClassReferences = classReferences.filter(isActionableClass);

  return {
    exceptionClasses,
    classReferences,
    actionableClassReferences,
    stackFrames: stackFrames.filter((frame) => isActionableClass(frame.className))
  };
}

function extractExceptionClasses(content: string): string[] {
  const matches = content.matchAll(
    /\b((?:[a-z_][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error))(?::|\s|$)/g
  );

  return [...matches].map((match) => match[1]).filter(Boolean);
}

function parseStackFrame(line: string): CrashStackFrame | undefined {
  const match = line.match(
    /^\s*at\s+((?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*)\.([A-Za-z_$<>][\w$<>]*)\(([^():]+)(?::(\d+))?\)/
  );

  if (!match) {
    return undefined;
  }

  return {
    className: match[1],
    methodName: match[2],
    sourceFile: match[3],
    lineNumber: match[4] ? Number(match[4]) : undefined
  };
}

function mergeLogSignals(logs: AnalyzedLogFile[]): CrashSignals {
  const stackFrames = logs.flatMap((log) => log.signals.stackFrames);
  const classReferences = unique(
    logs.flatMap((log) => log.signals.classReferences)
  );

  return {
    exceptionClasses: unique(
      logs.flatMap((log) => log.signals.exceptionClasses)
    ),
    classReferences,
    actionableClassReferences: classReferences.filter(isActionableClass),
    stackFrames
  };
}

function toDiagnosticFile(entry: LspPublishDiagnosticsParams): DiagnosticFile {
  return {
    uri: entry.uri,
    diagnosticCount: entry.diagnostics.length,
    diagnostics: entry.diagnostics.map(toCompactDiagnostic),
    truncated: entry.truncated === true,
    originalDiagnosticCount: entry.originalDiagnosticCount,
    omittedDiagnosticCount: entry.omittedDiagnosticCount
  };
}

function toCompactDiagnostic(diagnostic: LspDiagnostic): CompactDiagnostic {
  return {
    message: diagnostic.message,
    severity: diagnosticSeverity(diagnostic.severity),
    line: diagnostic.range ? diagnostic.range.start.line + 1 : undefined,
    character: diagnostic.range
      ? diagnostic.range.start.character + 1
      : undefined,
    code: diagnostic.code,
    source: diagnostic.source
  };
}

function diagnosticSeverity(severity: number | undefined): string {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "information";
    case 4:
      return "hint";
    default:
      return "unknown";
  }
}

function isActionableClass(className: string): boolean {
  return !IGNORED_ACTIONABLE_PREFIXES.some((prefix) =>
    className.startsWith(prefix)
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

interface AnalyzedLogFile {
  summary: {
    path: string;
    sizeBytes: number;
    readBytes: number;
    signalCount: number;
    truncated: boolean;
  };
  signals: CrashSignals;
}

interface CrashSignals {
  exceptionClasses: string[];
  classReferences: string[];
  actionableClassReferences: string[];
  stackFrames: CrashStackFrame[];
}

interface CrashStackFrame {
  className: string;
  methodName: string;
  sourceFile: string;
  lineNumber?: number;
}

interface DiagnosticFile {
  uri: string;
  diagnosticCount: number;
  diagnostics: CompactDiagnostic[];
  truncated: boolean;
  originalDiagnosticCount?: number;
  omittedDiagnosticCount?: number;
}

interface CompactDiagnostic {
  message: string;
  severity: string;
  line?: number;
  character?: number;
  code?: string | number;
  source?: string;
}
