import { open, stat } from "node:fs/promises";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

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

export async function executeMcpServerWorkspaceAnalyze(
  input: McpServerEvidenceExecutorInput
): Promise<McpServerEvidenceExecutorResult> {
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
