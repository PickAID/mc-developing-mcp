const MAX_STACK_FRAMES = 24;
const IGNORED_ACTIONABLE_PREFIXES = [
  "java.",
  "javax.",
  "jdk.",
  "sun.",
  "net.minecraft.",
  "com.mojang."
];
const IGNORED_LOADER_MOD_IDS = new Set([
  "java",
  "minecraft",
  "fabricloader",
  "fabric-loader",
  "quilt_loader",
  "forge",
  "neoforge"
]);

export interface CrashSignals {
  exceptionClasses: string[];
  resourceLocations: string[];
  resourcePaths: string[];
  classReferences: string[];
  actionableClassReferences: string[];
  mixinTargetClassReferences: string[];
  loaderModIds: string[];
  loaderModReferences: CrashLoaderModReference[];
  ftbQuestsErrors: CrashFtbQuestsError[];
  stackFrames: CrashStackFrame[];
}

export interface CrashStackFrame {
  className: string;
  methodName: string;
  sourceFile: string;
  lineNumber?: number;
}

export interface CrashLoaderModReference {
  modId: string;
  requestedBy?: string;
  expectedRange?: string;
  actualVersion?: string;
  kind: "missing_dependency" | "incompatible_dependency";
}

export interface CrashFtbQuestsError {
  kind: "load_error";
  path: string;
  message?: string;
}

export function parseCrashSignals(content: string): CrashSignals {
  const exceptionClasses = unique(extractExceptionClasses(content));
  const resourceLocations = unique(extractResourceLocations(content));
  const resourcePaths = unique(extractResourcePaths(content));
  const loaderModIds = unique(extractCrashMentionedModIds(content));
  const loaderModReferences = uniqueLoaderModReferences(
    extractLoaderModReferences(content)
  );
  const ftbQuestsErrors = uniqueFtbQuestsErrors(extractFtbQuestsErrors(content));
  const stackFrames = content
    .split(/\r?\n/)
    .map(parseStackFrame)
    .filter((frame): frame is CrashStackFrame => frame !== undefined)
    .slice(0, MAX_STACK_FRAMES);
  const mixinTargetClassReferences = unique(
    extractMixinTargetClassReferences(content)
  );
  const classReferences = unique([
    ...extractErrorClassReferences(content),
    ...mixinTargetClassReferences,
    ...stackFrames.map((frame) => frame.className)
  ]);
  const actionableClassReferences = classReferences.filter(isActionableClass);

  return {
    exceptionClasses,
    resourceLocations,
    resourcePaths,
    classReferences,
    actionableClassReferences,
    mixinTargetClassReferences,
    loaderModIds,
    loaderModReferences,
    ftbQuestsErrors,
    stackFrames: stackFrames.filter((frame) => isActionableClass(frame.className))
  };
}

export function countCrashSignals(signals: CrashSignals): number {
  return (
    signals.exceptionClasses.length +
    signals.classReferences.length +
    signals.resourceLocations.length +
    signals.resourcePaths.length +
    signals.loaderModIds.length +
    signals.loaderModReferences.length +
    signals.ftbQuestsErrors.length
  );
}

export function mergeCrashSignals(signals: CrashSignals[]): CrashSignals {
  const stackFrames = signals.flatMap((entry) => entry.stackFrames);
  const classReferences = unique(
    signals.flatMap((entry) => entry.classReferences)
  );
  const mixinTargetClassReferences = unique(
    signals.flatMap((entry) => entry.mixinTargetClassReferences)
  );

  return {
    exceptionClasses: unique(
      signals.flatMap((entry) => entry.exceptionClasses)
    ),
    resourceLocations: unique(
      signals.flatMap((entry) => entry.resourceLocations)
    ),
    resourcePaths: unique(signals.flatMap((entry) => entry.resourcePaths)),
    loaderModIds: unique(signals.flatMap((entry) => entry.loaderModIds)),
    loaderModReferences: uniqueLoaderModReferences(
      signals.flatMap((entry) => entry.loaderModReferences)
    ),
    ftbQuestsErrors: uniqueFtbQuestsErrors(
      signals.flatMap((entry) => entry.ftbQuestsErrors)
    ),
    classReferences,
    actionableClassReferences: classReferences.filter(isActionableClass),
    mixinTargetClassReferences,
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
    signals.resourcePaths.length === 0 &&
    signals.loaderModIds.length === 0 &&
    signals.loaderModReferences.length === 0
  ) {
    return `Extracted ${signals.actionableClassReferences.length} actionable crash class reference(s) from ${logCount} log file(s).`;
  }
  if (
    signals.loaderModReferences.length > 0 &&
    signals.actionableClassReferences.length === 0 &&
    signals.resourceLocations.length === 0 &&
    signals.resourcePaths.length === 0
  ) {
    return `Extracted ${signals.loaderModReferences.length} actionable crash loader mod reference(s) from ${logCount} log file(s).`;
  }
  if (
    signals.ftbQuestsErrors.length > 0 &&
    signals.actionableClassReferences.length === 0 &&
    signals.loaderModReferences.length === 0 &&
    signals.loaderModIds.length === 0
  ) {
    return `Extracted ${signals.ftbQuestsErrors.length} actionable FTB Quests schema signal(s) from ${logCount} log file(s).`;
  }

  const signalCount =
    signals.actionableClassReferences.length +
    signals.resourceLocations.length +
    signals.resourcePaths.length +
    signals.loaderModIds.length +
    signals.loaderModReferences.length +
    signals.ftbQuestsErrors.length;

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

function extractMixinTargetClassReferences(content: string): string[] {
  const matches = content.matchAll(
    /\bMixin apply failed\b.*?->\s+((?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*)\b/gi
  );

  return [...matches]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

function extractLoaderModReferences(content: string): CrashLoaderModReference[] {
  return [
    ...extractFabricLoaderModReferences(content),
    ...extractForgeLoaderModReferences(content)
  ].filter((reference) => !IGNORED_LOADER_MOD_IDS.has(reference.modId));
}

function extractCrashMentionedModIds(content: string): string[] {
  return unique([
    ...extractForgeCrashSectionModIds(content),
    ...extractTaintedModIds(content)
  ]).filter((modId) => !IGNORED_LOADER_MOD_IDS.has(modId));
}

function extractForgeCrashSectionModIds(content: string): string[] {
  const matches = content.matchAll(/^-- MOD ([A-Za-z0-9_.-]+) --$/gim);

  return [...matches]
    .map((match) => normalizeModId(match[1]))
    .filter((value): value is string => value !== undefined);
}

function extractTaintedModIds(content: string): string[] {
  const matches = content.matchAll(/\btainted by mods:\s*\[([^\]]+)\]/gi);

  return [...matches].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((value) => normalizeModId(value))
      .filter((value): value is string => value !== undefined)
  );
}

function extractFabricLoaderModReferences(
  content: string
): CrashLoaderModReference[] {
  const matches = content.matchAll(
    /\bMod\s+['"][^'"]+['"]\s+\(([A-Za-z0-9_.-]+)\)[^\n]*?\b(?:requires|depends on)\s+(?:version\s+)?(.+?)\s+of\s+(?:['"][^'"]+['"]\s+\()?([A-Za-z0-9_.-]+)\)?\s*,\s+(?:(which is missing)|(?:but [^\n]*?present:?\s*([^!\n]+)))/gi
  );

  return [...matches].flatMap((match) => {
    const modId = normalizeModId(match[3]);
    if (!modId) {
      return [];
    }
    const actualVersion = match[4] ? "missing" : cleanLoaderText(match[5]);

    return [{
      modId,
      requestedBy: normalizeModId(match[1]),
      expectedRange: cleanLoaderText(match[2]),
      actualVersion,
      kind: isMissingActualVersion(actualVersion)
        ? "missing_dependency"
        : "incompatible_dependency"
    }];
  });
}

function extractForgeLoaderModReferences(
  content: string
): CrashLoaderModReference[] {
  const matches = content.matchAll(
    /\bMod ID:\s*['"]?([A-Za-z0-9_.-]+)['"]?\s*,\s*Requested by:\s*['"]?([A-Za-z0-9_.-]+)['"]?\s*,\s*Expected range:\s*['"]?([^'"\n]+)['"]?\s*,\s*Actual version:\s*['"]?([^'"\n]+)['"]?/gi
  );

  return [...matches].flatMap((match) => {
    const modId = normalizeModId(match[1]);
    if (!modId) {
      return [];
    }
    const actualVersion = cleanLoaderText(match[4]);

    return [{
      modId,
      requestedBy: normalizeModId(match[2]),
      expectedRange: cleanLoaderText(match[3]),
      actualVersion,
      kind: isMissingActualVersion(actualVersion)
        ? "missing_dependency"
        : "incompatible_dependency"
    }];
  });
}

function extractFtbQuestsErrors(content: string): CrashFtbQuestsError[] {
  const lines = content.split(/\r?\n/);
  const errors: CrashFtbQuestsError[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const pathMatch = line.match(
      /\b(config\/ftbquests\/quests\/[^\s"'`]+\.snbt)\b/i
    );

    if (!pathMatch || !line.toLowerCase().includes("ftbquests")) {
      continue;
    }

    errors.push({
      kind: "load_error",
      path: pathMatch[1],
      message: extractFtbQuestsErrorMessage(lines, index)
    });
  }

  return errors;
}

function extractFtbQuestsErrorMessage(
  lines: string[],
  pathLineIndex: number
): string | undefined {
  for (const line of lines.slice(pathLineIndex + 1, pathLineIndex + 5)) {
    const message = line.match(
      /(?:IllegalArgumentException|RuntimeException|JsonParseException|SNBTException):\s*(.+)$/i
    )?.[1]?.trim();

    if (message) {
      return message;
    }
  }

  return undefined;
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
  const assetDataMatches = content.matchAll(
    /\b((?:data|assets)\/[a-z0-9_.-]+\/[a-z0-9_./-]+\.(?:json|mcmeta|txt|toml|lang))\b/g
  );
  const metadataMatches = content.matchAll(
    /\b((?:[A-Za-z0-9_.-]+\.mixins?\.json|(?:fabric|quilt)\.mod\.json|pack\.mcmeta|META-INF\/(?:mods|neoforge\.mods)\.toml))\b/g
  );

  return [...assetDataMatches, ...metadataMatches]
    .map((match) => match[1])
    .filter(Boolean);
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

function normalizeModId(value: string | undefined): string | undefined {
  const cleaned = cleanLoaderText(value)?.toLowerCase();
  return cleaned && /^[a-z0-9_.-]+$/.test(cleaned) ? cleaned : undefined;
}

function cleanLoaderText(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/^['"]|['"]$/g, "");
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function isMissingActualVersion(value: string | undefined): boolean {
  return !value || value.toLowerCase().includes("missing");
}

function uniqueLoaderModReferences(
  values: CrashLoaderModReference[]
): CrashLoaderModReference[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = [
      value.modId,
      value.requestedBy ?? "",
      value.expectedRange ?? "",
      value.actualVersion ?? "",
      value.kind
    ].join("\0");

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueFtbQuestsErrors(
  values: CrashFtbQuestsError[]
): CrashFtbQuestsError[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = [value.kind, value.path, value.message ?? ""].join("\0");

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
