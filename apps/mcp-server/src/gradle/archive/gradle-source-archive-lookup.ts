import {
  discoverDeclaredDependencySourceArchives,
  discoverGradleSourceArchives,
  readGradleDeclaredDependencies,
  type GradleDeclaredDependency,
  type GradleSourceArchiveCandidate
} from "@mcpskill/gradle-adapter";
import { readArchiveContentFile } from "@mcpskill/jar-source-adapter";

import {
  createLineRangeEvidence,
  type LineRangeEvidenceOptions
} from "../../source-bundle/shared/line-range-evidence.js";
import { buildSourceReadNextReads } from "../../source-bundle/shared/source-read-next.js";

const DEFAULT_GRADLE_SOURCE_MAX_BYTES = 65_536;
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

  if (declaredResult) {
    return declaredResult;
  }

  const archives = await discoverGradleSourceArchives({
    workspaceRoot: input.workspaceRoot,
    gradleUserHome: input.discovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.discovery?.includeDefaultGradleUserHome,
    maxVisitedEntries: input.discovery?.maxVisitedEntries,
    maxResults: input.discovery?.maxResults
  });
  const rankedArchives = rankGradleSourceArchives(
    archives,
    request,
    declaredDependencies
  );
  return readFirstMatchingArchive(rankedArchives, request);
}

async function readFirstMatchingArchive(
  archives: GradleSourceArchiveCandidate[],
  request: GradleSourceArchiveRequest
): Promise<GradleSourceArchiveLookupResult | undefined> {
  const skipped: GradleSourceArchiveSkippedEntry[] = [];
  let searchedArchives = 0;

  for (const archive of archives) {
    searchedArchives += 1;
    const readResult = await readArchiveContentFile({
      sourceArchive: archive.archivePath,
      relativePath: request.relativePath,
      maxBytes: DEFAULT_GRADLE_SOURCE_MAX_BYTES
    });

    if (readResult.content && readResult.entry) {
      const range = createLineRangeEvidence(
        readResult.content,
        buildRangeOptions(request)
      );
      return {
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
      };
    }

    if (readResult.skipped && readResult.skipped.reason !== "not-found") {
      skipped.push({
        sourceArchive: archive.archivePath,
        relativePath: readResult.skipped.relativePath,
        reason: readResult.skipped.reason
      });
    }
  }

  return undefined;
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
      ...findLineForRelativePath(relativePath, lineHints)
    };
  }

  const pathMatch = requestText.match(
    /\b(?:[a-z_][\w$]*\/){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*(?:\.java)?\b/
  );
  if (!pathMatch || pathMatch[0].startsWith("net/minecraft/")) {
    return undefined;
  }

  const relativePath = toOuterJavaSourcePath(
    pathMatch[0].endsWith(".java") ? pathMatch[0] : `${pathMatch[0]}.java`
  );
  return {
    symbol: relativePath.replace(/\.java$/i, "").replaceAll("/", "."),
    relativePath,
    ...findLineForRelativePath(relativePath, lineHints)
  };
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
        request.symbol,
        declaredDependencies
      )
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.archive);
}

function scoreGradleSourceArchive(
  archivePath: string,
  symbol: string,
  declaredDependencies: GradleDeclaredDependency[]
): number {
  const normalizedPath = archivePath.toLowerCase().replaceAll("\\", "/");
  const packageParts = symbol.toLowerCase().split(".").slice(0, -1);
  let score = scoreDeclaredDependencyMatch(normalizedPath, declaredDependencies);

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
