import { readFile, stat } from "node:fs/promises";
import {
  basename,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
} from "node:path";
import { fileURLToPath } from "node:url";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

const MAX_REFERENCES = 8;
const MAX_BYTES_PER_FILE = 128 * 1024;
const IGNORED_CLASS_PREFIXES = [
  "java.",
  "javax.",
  "jdk.",
  "sun.",
  "net.minecraft.",
  "com.mojang."
];

export async function resolveMcpServerWorkspaceSource(
  input: McpServerEvidenceExecutorInput
): Promise<McpServerEvidenceExecutorResult | undefined> {
  const workspaceContext = input.requestPlan.requestContext.workspaceContext;
  const requestText = input.requestPlan.requestText ?? "";

  if (!workspaceContext) {
    return undefined;
  }

  const references = [
    ...(await readRequestedBuildFiles(workspaceContext.descriptor.root, {
      buildFiles: workspaceContext.descriptor.buildFiles,
      requestText
    })),
    ...(await readRequestedJavaSources(workspaceContext.descriptor.root, {
      javaSourceRoots: workspaceContext.descriptor.javaSourceRoots,
      requestText
    }))
  ].slice(0, MAX_REFERENCES);

  if (references.length === 0) {
    return undefined;
  }

  return {
    matched: true,
    summary: `Resolved ${references.length} local workspace source file(s).`,
    payload: {
      source: "workspace_source",
      mode: "local_files",
      references,
      truncated: references.length >= MAX_REFERENCES
    }
  };
}

async function readRequestedBuildFiles(
  workspaceRoot: string,
  input: { buildFiles: string[]; requestText: string }
): Promise<WorkspaceSourceReference[]> {
  if (!mentionsBuildFile(input.requestText)) {
    return [];
  }

  const requestedNames = extractRequestedBuildFileNames(input.requestText);
  const candidates =
    requestedNames.length === 0
      ? input.buildFiles
      : input.buildFiles.filter((filePath) =>
          requestedNames.includes(basename(filePath))
        );

  return readReferences(
    workspaceRoot,
    candidates,
    (filePath): WorkspaceSourceReferenceBase => ({
      kind: "gradle",
      absolutePath: filePath
    })
  );
}

async function readRequestedJavaSources(
  workspaceRoot: string,
  input: { javaSourceRoots: string[]; requestText: string }
): Promise<WorkspaceSourceReference[]> {
  const classNames = extractJavaClassReferences(input.requestText);
  const paths = new Map<string, { path: string; symbol: string }>();

  for (const sourcePath of extractRequestedJavaSourcePaths(input.requestText)) {
    const resolvedPath = resolveRequestedWorkspacePath(
      workspaceRoot,
      sourcePath
    );
    if (!resolvedPath) {
      continue;
    }

    paths.set(resolvedPath, {
      path: resolvedPath,
      symbol: deriveJavaSymbol(resolvedPath, input.javaSourceRoots)
    });
  }

  for (const className of classNames) {
    const sourceRelativePath = `${className.replace(/\$.+$/, "").replaceAll(".", "/")}.java`;

    for (const sourceRoot of input.javaSourceRoots) {
      const sourcePath = join(sourceRoot, sourceRelativePath);
      paths.set(sourcePath, {
        path: sourcePath,
        symbol: className
      });
    }
  }

  const references: WorkspaceSourceReference[] = [];
  for (const candidate of paths.values()) {
    const [reference] = await readReferences(
      workspaceRoot,
      [candidate.path],
      (filePath): WorkspaceSourceReferenceBase => ({
        kind: "java",
        absolutePath: filePath,
        symbol: candidate.symbol
      })
    );

    if (reference) {
      references.push(reference);
    }
  }

  return references;
}

async function readReferences(
  workspaceRoot: string,
  paths: string[],
  createBase: (filePath: string) => WorkspaceSourceReferenceBase
): Promise<WorkspaceSourceReference[]> {
  const references: WorkspaceSourceReference[] = [];

  for (const filePath of paths) {
    const content = await readTextFileWithinBudget(filePath);
    if (content === undefined) {
      continue;
    }

    const base = createBase(filePath);
    references.push({
      ...base,
      relativePath: toPosixPath(relative(workspaceRoot, filePath)),
      content
    });
  }

  return references;
}

async function readTextFileWithinBudget(
  filePath: string
): Promise<string | undefined> {
  try {
    const details = await stat(filePath);
    if (!details.isFile() || details.size > MAX_BYTES_PER_FILE) {
      return undefined;
    }

    const content = await readFile(filePath);
    if (isBinary(content)) {
      return undefined;
    }

    return content.toString("utf-8");
  } catch {
    return undefined;
  }
}

function mentionsBuildFile(requestText: string): boolean {
  return /\b(?:build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.properties|libs\.versions\.toml|gradle)\b/i.test(
    requestText
  );
}

function extractRequestedBuildFileNames(requestText: string): string[] {
  const matches = requestText.matchAll(
    /\b(?:build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.properties|libs\.versions\.toml)\b/gi
  );

  return [...new Set([...matches].map((match) => match[0]))];
}

function extractJavaClassReferences(requestText: string): string[] {
  const matches = requestText.matchAll(
    /\b(?:[a-z_][\w$]*\.)+[A-Z][\w$]*(?:\$[A-Z][\w$]*)?\b/g
  );

  return [...new Set([...matches].map((match) => match[0]))]
    .filter((className) => !isIgnoredClass(className))
    .slice(0, MAX_REFERENCES);
}

function extractRequestedJavaSourcePaths(requestText: string): string[] {
  const matches = requestText.matchAll(
    /(?:file:\/\/\/[^\s,;`"')]+?\.java|(?:\/|[A-Za-z0-9_.-]+\/)[^\s,;`"')]*?[A-Za-z_$][\w$]*\.java)\b/g
  );

  return [...new Set([...matches].map((match) => match[0]))].slice(
    0,
    MAX_REFERENCES
  );
}

function resolveRequestedWorkspacePath(
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

function deriveJavaSymbol(filePath: string, javaSourceRoots: string[]): string {
  for (const sourceRoot of javaSourceRoots) {
    if (!isWithin(sourceRoot, filePath)) {
      continue;
    }

    return toPosixPath(relative(sourceRoot, filePath))
      .replace(/\.java$/u, "")
      .replaceAll("/", ".");
  }

  return basename(filePath).replace(/\.java$/u, "");
}

function isIgnoredClass(className: string): boolean {
  return IGNORED_CLASS_PREFIXES.some((prefix) => className.startsWith(prefix));
}

function isBinary(content: Buffer): boolean {
  if (content.includes(0)) {
    return true;
  }

  const sampleLength = Math.min(content.length, 512);
  let controlCharacters = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const byte = content[index];
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlCharacters += 1;
    }
  }

  return sampleLength > 0 && controlCharacters / sampleLength > 0.1;
}

function toPosixPath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function isWithin(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

type WorkspaceSourceKind = "gradle" | "java";

interface WorkspaceSourceReferenceBase {
  kind: WorkspaceSourceKind;
  absolutePath: string;
  symbol?: string;
}

interface WorkspaceSourceReference extends WorkspaceSourceReferenceBase {
  relativePath: string;
  content: string;
}
