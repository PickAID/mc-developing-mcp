const MAX_STACK_FRAMES = 24;
const IGNORED_ACTIONABLE_PREFIXES = [
  "java.",
  "javax.",
  "jdk.",
  "sun.",
  "net.minecraft.",
  "com.mojang."
];

export interface CrashSignals {
  exceptionClasses: string[];
  resourceLocations: string[];
  resourcePaths: string[];
  classReferences: string[];
  actionableClassReferences: string[];
  stackFrames: CrashStackFrame[];
}

export interface CrashStackFrame {
  className: string;
  methodName: string;
  sourceFile: string;
  lineNumber?: number;
}

export function parseCrashSignals(content: string): CrashSignals {
  const exceptionClasses = unique(extractExceptionClasses(content));
  const resourceLocations = unique(extractResourceLocations(content));
  const resourcePaths = unique(extractResourcePaths(content));
  const stackFrames = content
    .split(/\r?\n/)
    .map(parseStackFrame)
    .filter((frame): frame is CrashStackFrame => frame !== undefined)
    .slice(0, MAX_STACK_FRAMES);
  const classReferences = unique([
    ...extractErrorClassReferences(content),
    ...stackFrames.map((frame) => frame.className)
  ]);
  const actionableClassReferences = classReferences.filter(isActionableClass);

  return {
    exceptionClasses,
    resourceLocations,
    resourcePaths,
    classReferences,
    actionableClassReferences,
    stackFrames: stackFrames.filter((frame) => isActionableClass(frame.className))
  };
}

export function countCrashSignals(signals: CrashSignals): number {
  return (
    signals.exceptionClasses.length +
    signals.classReferences.length +
    signals.resourceLocations.length +
    signals.resourcePaths.length
  );
}

export function mergeCrashSignals(signals: CrashSignals[]): CrashSignals {
  const stackFrames = signals.flatMap((entry) => entry.stackFrames);
  const classReferences = unique(
    signals.flatMap((entry) => entry.classReferences)
  );

  return {
    exceptionClasses: unique(
      signals.flatMap((entry) => entry.exceptionClasses)
    ),
    resourceLocations: unique(
      signals.flatMap((entry) => entry.resourceLocations)
    ),
    resourcePaths: unique(signals.flatMap((entry) => entry.resourcePaths)),
    classReferences,
    actionableClassReferences: classReferences.filter(isActionableClass),
    stackFrames
  };
}

export function formatCrashSignalSummary(
  signals: CrashSignals,
  logCount: number
): string {
  if (
    signals.actionableClassReferences.length > 0 &&
    signals.resourceLocations.length === 0 &&
    signals.resourcePaths.length === 0
  ) {
    return `Extracted ${signals.actionableClassReferences.length} actionable crash class reference(s) from ${logCount} log file(s).`;
  }

  const signalCount =
    signals.actionableClassReferences.length +
    signals.resourceLocations.length +
    signals.resourcePaths.length;

  return `Extracted ${signalCount} actionable crash signal(s) from ${logCount} log file(s).`;
}

function extractExceptionClasses(content: string): string[] {
  const matches = content.matchAll(
    /\b((?:[a-z_][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error))(?::|\s|$)/g
  );

  return [...matches].map((match) => match[1]).filter(Boolean);
}

function extractErrorClassReferences(content: string): string[] {
  const missingClassMatches = content.matchAll(
    /\b(?:NoClassDefFoundError|ClassNotFoundException):\s+((?:[a-z_][\w$]*[./]){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*)/g
  );
  const linkageOwnerMatches = content.matchAll(
    /\b(?:NoSuchMethodError|NoSuchFieldError):\s+(?:'[^']*?\s+)?((?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*)[.#]/g
  );

  return unique(
    [...missingClassMatches, ...linkageOwnerMatches]
      .map((match) => match[1]?.replaceAll("/", "."))
      .filter((value): value is string => value !== undefined)
  );
}

function extractResourceLocations(content: string): string[] {
  const matches = content.matchAll(
    /#?\b([a-z0-9_.-]+:[a-z0-9_./-]+)\b/g
  );

  return [...matches]
    .filter((match) => isLikelyResourceLocationMatch(content, match))
    .map((match) => match[1])
    .filter(Boolean);
}

function isLikelyResourceLocationMatch(
  content: string,
  match: RegExpMatchArray
): boolean {
  const value = match[1];
  const matchIndex = match.index ?? 0;
  const previous = matchIndex > 0 ? content[matchIndex - 1] : "";
  const path = value.split(":")[1] ?? "";

  return previous !== "." && /[a-z_/-]/.test(path);
}

function extractResourcePaths(content: string): string[] {
  const matches = content.matchAll(
    /\b((?:data|assets)\/[a-z0-9_.-]+\/[a-z0-9_./-]+\.(?:json|mcmeta|txt|toml|lang))\b/g
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

function isActionableClass(className: string): boolean {
  return !IGNORED_ACTIONABLE_PREFIXES.some((prefix) =>
    className.startsWith(prefix)
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
