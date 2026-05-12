import {
  discoverDeclaredDependencySourceArchives,
  discoverGradleSourceArchives,
  readGradleDeclaredDependencies,
  type GradleDeclaredDependency,
  type GradleSourceArchiveCandidate
} from "minecraft-developing-mcp-gradle-adapter";
import {
  listArchiveContent,
  readArchiveContentFile
} from "minecraft-developing-mcp-jar-source-adapter";

import {
  createLineRangeEvidence,
  type LineRangeEvidenceOptions
} from "../../source-bundle/shared/line-range-evidence.js";
import { buildSourceReadNextReads } from "../../source-bundle/shared/source-read-next.js";

const DEFAULT_GRADLE_SOURCE_MAX_BYTES = 65_536;
const DEFAULT_GRADLE_SOURCE_SCAN_MAX_RESULTS = 2_000;
const DEFAULT_GRADLE_SOURCE_SCAN_MAX_VISITED_ENTRIES = 200_000;
const LINE_HINT_RADIUS = 20;
const LINE_HINT_MAX_LINES = 41;

export interface GradleSourceArchiveDiscoveryOptions {
  enabled?: boolean;
  gradleUserHome?: string;
  includeDefaultGradleUserHome?: boolean;
  maxVisitedEntries?: number;
  maxResults?: number;
}

export interface GradleSourceArchiveRequest {
  symbol: string;
  relativePath: string;
  simpleName?: string;
  versionHints: string[];
  line?: number;
  endLine?: number;
}

export interface GradleSourceArchiveReference {
  sourceArchive: string;
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  nextReads: string[];
  reason: string;
}

export interface GradleSourceArchiveLookupResult {
  status: "ready";
  request: GradleSourceArchiveRequest;
  searchedArchives: number;
  references: GradleSourceArchiveReference[];
  skipped: GradleSourceArchiveSkippedEntry[];
}

export interface GradleSourceArchiveSkippedEntry {
  sourceArchive: string;
  relativePath: string;
  reason: string;
}

export async function resolveGradleSourceArchiveLookup(input: {
  workspaceRoot: string;
  requestText?: string;
  discovery?: GradleSourceArchiveDiscoveryOptions;
}): Promise<GradleSourceArchiveLookupResult | undefined> {
  const request = extractGradleSourceArchiveRequest(input.requestText);

  if (!request || input.discovery?.enabled === false) {
    return undefined;
  }

  const declaredDependencies = await readGradleDeclaredDependencies({
    workspaceRoot: input.workspaceRoot
  });
  const declaredArchives = await discoverDeclaredDependencySourceArchives({
    workspaceRoot: input.workspaceRoot,
    gradleUserHome: input.discovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.discovery?.includeDefaultGradleUserHome,
    dependencies: declaredDependencies
  });
  const declaredResult = await readFirstMatchingArchive(
    declaredArchives,
    request
  );

  if (declaredResult.match) {
    return declaredResult.match;
  }

  const archives = await discoverGradleSourceArchives({
    workspaceRoot: input.workspaceRoot,
    gradleUserHome: input.discovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.discovery?.includeDefaultGradleUserHome,
    maxVisitedEntries:
      input.discovery?.maxVisitedEntries ??
      DEFAULT_GRADLE_SOURCE_SCAN_MAX_VISITED_ENTRIES,
    maxResults:
      input.discovery?.maxResults ?? DEFAULT_GRADLE_SOURCE_SCAN_MAX_RESULTS
  });
  const rankedArchives = rankGradleSourceArchives(
    excludeAlreadySearchedArchives(archives, declaredArchives),
    request,
    declaredDependencies
  );
  const broadResult = await readFirstMatchingArchive(rankedArchives, request, {
    initialSearchedArchives: declaredResult.searchedArchives,
    initialSkipped: declaredResult.skipped
  });
  return broadResult.match;
}

async function readFirstMatchingArchive(
  archives: GradleSourceArchiveCandidate[],
  request: GradleSourceArchiveRequest,
  initial?: {
    initialSearchedArchives?: number;
    initialSkipped?: GradleSourceArchiveSkippedEntry[];
  }
): Promise<{
  match?: GradleSourceArchiveLookupResult;
  searchedArchives: number;
  skipped: GradleSourceArchiveSkippedEntry[];
}> {
  const skipped = [...(initial?.initialSkipped ?? [])];
  let searchedArchives = initial?.initialSearchedArchives ?? 0;

  for (const archive of archives) {
    searchedArchives += 1;
    const readResult = await readArchiveContentFile({
      sourceArchive: archive.archivePath,
      relativePath: await resolveArchiveRelativePath(archive.archivePath, request),
      maxBytes: DEFAULT_GRADLE_SOURCE_MAX_BYTES
    });

    if (readResult.content && readResult.entry) {
      const range = createLineRangeEvidence(
        readResult.content,
        buildRangeOptions(request)
      );
      return {
        match: {
          status: "ready",
          request,
          searchedArchives,
          references: [
            {
              sourceArchive: archive.archivePath,
              relativePath: readResult.entry.relativePath,
              ...range,
              nextReads: buildSourceReadNextReads({
                path: readResult.entry.relativePath,
                startLine: range.startLine,
                endLine: range.endLine
              }),
              reason: archive.reason
            }
          ],
          skipped
        },
        searchedArchives,
        skipped
      };
    }

    if (readResult.skipped) {
      skipped.push({
        sourceArchive: archive.archivePath,
        relativePath: readResult.skipped.relativePath,
        reason: readResult.skipped.reason
      });
    }
  }

  return { searchedArchives, skipped };
}

async function resolveArchiveRelativePath(
  sourceArchive: string,
  request: GradleSourceArchiveRequest
): Promise<string> {
  if (!request.simpleName) {
    return request.relativePath;
  }

  const entries = await listArchiveContent({
    sourceArchive,
    domains: ["java"]
  });
  const expectedFileName = `${request.simpleName.replace(/\$.*$/, "")}.java`;
  const match = entries.entries.find(
    (entry) =>
      entry.relativePath === expectedFileName ||
      entry.relativePath.endsWith(`/${expectedFileName}`)
  );

  return match?.relativePath ?? request.relativePath;
}

function excludeAlreadySearchedArchives(
  archives: GradleSourceArchiveCandidate[],
  searchedArchives: GradleSourceArchiveCandidate[]
): GradleSourceArchiveCandidate[] {
  const searchedPaths = new Set(
    searchedArchives.map((archive) => archive.archivePath)
  );

  return archives.filter((archive) => !searchedPaths.has(archive.archivePath));
}

function extractGradleSourceArchiveRequest(
  requestText?: string
): GradleSourceArchiveRequest | undefined {
  if (!requestText) {
    return undefined;
  }
  const lineHints = extractLineHints(requestText);

  const symbolMatch = requestText.match(
    /\b(?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*\b/
  );
  if (symbolMatch && !symbolMatch[0].startsWith("net.minecraft.")) {
    const relativePath = toJavaSourceRelativePath(symbolMatch[0]);
    return {
      symbol: symbolMatch[0],
      relativePath,
      versionHints: extractVersionHints(requestText),
      ...findLineForRelativePath(relativePath, lineHints)
    };
  }

  const pathMatch = requestText.match(
    /\b(?:[a-z_][\w$]*\/){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*(?:\.java)?\b/
  );
  if (pathMatch && !pathMatch[0].startsWith("net/minecraft/")) {
    const relativePath = toOuterJavaSourcePath(
      pathMatch[0].endsWith(".java") ? pathMatch[0] : `${pathMatch[0]}.java`
    );
    return {
      symbol: relativePath.replace(/\.java$/i, "").replaceAll("/", "."),
      relativePath,
      versionHints: extractVersionHints(requestText),
      ...findLineForRelativePath(relativePath, lineHints)
    };
  }

  const simpleName = mentionsSimpleJavaSourceLookup(requestText)
    ? extractSimpleJavaClassName(requestText)
    : undefined;
  if (!simpleName) {
    return undefined;
  }

  const relativePath = `${simpleName.replace(/\$.*$/, "")}.java`;
  return {
    symbol: simpleName,
    relativePath,
    simpleName,
    versionHints: extractVersionHints(requestText),
    ...findLineForRelativePath(relativePath, lineHints)
  };
}

function mentionsSimpleJavaSourceLookup(requestText: string): boolean {
  return (
    /\b(?:open|read|show|inspect|查看|读取|打开)\b/i.test(requestText) &&
    /\b(?:source|sources|java|gradle cache|源码|源代码)\b/i.test(requestText)
  );
}

function extractVersionHints(requestText: string): string[] {
  const matches = requestText.matchAll(/\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?\b/g);
  return [...new Set([...matches].map((match) => match[0].toLowerCase()))];
}

function extractSimpleJavaClassName(requestText: string): string | undefined {
  const ignored = new Set([
    "Cache",
    "Class",
    "Code",
    "Forge",
    "Gradle",
    "Inspect",
    "Java",
    "Minecraft",
    "NeoForge",
    "Read",
    "Source"
  ]);
  const matches = requestText.matchAll(/\b[A-Z_$][A-Za-z0-9_$]*(?:\.java)?\b/g);

  for (const match of matches) {
    const simpleName = match[0].replace(/\.java$/i, "");
    if (!ignored.has(simpleName) && /[a-z]/.test(simpleName)) {
      return simpleName;
    }
  }

  return undefined;
}

function buildRangeOptions(
  request: GradleSourceArchiveRequest
): LineRangeEvidenceOptions {
  if (request.line === undefined) {
    return {};
  }
  if (request.endLine !== undefined) {
    return {
      startLine: request.line,
      endLine: request.endLine,
      maxLines: LINE_HINT_MAX_LINES
    };
  }

  return {
    targetLine: request.line,
    radius: LINE_HINT_RADIUS,
    maxLines: LINE_HINT_MAX_LINES
  };
}

function extractLineHints(
  requestText: string
): Array<{ path: string; line: number; endLine?: number }> {
  const matches = requestText.matchAll(
    /\b([A-Za-z0-9_.$/-]+\.java):(\d+)(?:-(\d+)|:\d+)?/gi
  );

  return [...matches].map((match) => ({
    path: match[1].replaceAll("\\", "/"),
    line: Number(match[2]),
    endLine: match[3] ? Number(match[3]) : undefined
  }));
}

function findLineForRelativePath(
  relativePath: string,
  lineHints: Array<{ path: string; line: number; endLine?: number }>
): { line?: number; endLine?: number } {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  const hint = lineHints.find(
    (entry) =>
      entry.path === fileName ||
      entry.path === relativePath ||
      relativePath.endsWith(`/${entry.path}`)
  );

  return hint ? { line: hint.line, endLine: hint.endLine } : {};
}

function toJavaSourceRelativePath(symbol: string): string {
  const parts = symbol.split(".");
  const simpleName = parts.pop() ?? symbol;

  return [...parts, `${simpleName.replace(/\$.*$/, "")}.java`].join("/");
}

function toOuterJavaSourcePath(relativePath: string): string {
  return relativePath.replace(/\$[^/.]*(?=\.java$)/, "");
}

function rankGradleSourceArchives(
  archives: GradleSourceArchiveCandidate[],
  request: GradleSourceArchiveRequest,
  declaredDependencies: GradleDeclaredDependency[]
): GradleSourceArchiveCandidate[] {
  return archives
    .map((archive, index) => ({
      archive,
      index,
      score: scoreGradleSourceArchive(
        archive.archivePath,
        request,
        declaredDependencies
      )
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.archive);
}

function scoreGradleSourceArchive(
  archivePath: string,
  request: GradleSourceArchiveRequest,
  declaredDependencies: GradleDeclaredDependency[]
): number {
  const normalizedPath = archivePath.toLowerCase().replaceAll("\\", "/");
  const packageParts = request.symbol.toLowerCase().split(".").slice(0, -1);
  const simpleName = request.symbol.toLowerCase().split(".").at(-1);
  let score = scoreDeclaredDependencyMatch(normalizedPath, declaredDependencies);

  if (simpleName && normalizedPath.includes(simpleName.replace(/\$.*$/, ""))) {
    score += 12;
  }

  for (const version of request.versionHints) {
    if (normalizedPath.includes(`/${version}/`) || normalizedPath.includes(version)) {
      score += 50;
    }
  }

  for (let length = packageParts.length; length >= 2; length -= 1) {
    const dottedPackage = packageParts.slice(0, length).join(".");
    const slashedPackage = packageParts.slice(0, length).join("/");

    if (normalizedPath.includes(`/${dottedPackage}/`)) {
      score += 10 + length;
      break;
    }
    if (normalizedPath.includes(`/${slashedPackage}/`)) {
      score += 8 + length;
      break;
    }
  }

  for (const packagePart of packageParts.slice(2)) {
    if (normalizedPath.includes(packagePart)) {
      score += 1;
    }
  }

  return score;
}

function scoreDeclaredDependencyMatch(
  normalizedArchivePath: string,
  declaredDependencies: GradleDeclaredDependency[]
): number {
  for (const dependency of declaredDependencies) {
    const group = dependency.group.toLowerCase();
    const artifact = dependency.artifact.toLowerCase();
    const version = dependency.version?.toLowerCase();
    const coordinatePath = version
      ? `/${group}/${artifact}/${version}/`
      : `/${group}/${artifact}/`;

    if (normalizedArchivePath.includes(coordinatePath)) {
      return 100;
    }
    if (normalizedArchivePath.includes(`/${group}/${artifact}/`)) {
      return 80;
    }
  }

  return 0;
}
