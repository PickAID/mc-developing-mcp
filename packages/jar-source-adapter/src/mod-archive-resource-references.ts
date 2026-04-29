import {
  listArchiveContent,
  readArchiveContentFile,
  type ArchiveContentCache,
  type ArchiveContentSkippedEntry
} from "./archive-content.js";
import { listNestedArchiveContent } from "./nested-archive-list.js";
import { readNestedArchiveContentFile } from "./nested-archive-read.js";

export type ModArchiveResourceReferenceKind =
  | "blockstates"
  | "models"
  | "textures"
  | "other";

export type ModArchiveResourceReferenceRelation =
  | "blockstate_model"
  | "model_parent"
  | "model_texture";

export type ModArchiveResourceReferenceStatus = "resolved" | "missing";

export interface ModArchiveResourceReference {
  fromPath: string;
  fromKind: ModArchiveResourceReferenceKind;
  relation: ModArchiveResourceReferenceRelation;
  value: string;
  toPath: string;
  toKind: ModArchiveResourceReferenceKind;
  status: ModArchiveResourceReferenceStatus;
}

export interface ModArchiveResourceReferenceTrace {
  sourceArchive: string;
  embeddedArchivePath?: string;
  startPaths: string[];
  references: ModArchiveResourceReference[];
  unresolved: ModArchiveResourceReference[];
  skipped: ArchiveContentSkippedEntry[];
  truncated: boolean;
}

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_REFERENCES = 32;
const DEFAULT_MAX_BYTES = 65_536;

export async function traceModArchiveResourceReferences(input: {
  sourceArchive: string;
  startPaths: string[];
  maxDepth?: number;
  maxReferences?: number;
  maxBytesPerFile?: number;
  cache?: ArchiveContentCache;
}): Promise<ModArchiveResourceReferenceTrace> {
  const listed = await listArchiveContent({
    sourceArchive: input.sourceArchive,
    domains: ["assets"],
    cache: input.cache
  });
  const entriesByPath = new Set(
    listed.entries.map((entry) => entry.relativePath)
  );
  const startPaths = unique(input.startPaths).filter(isTraceableAssetPath);
  const trace = await traceResourceReferences({
    entriesByPath,
    startPaths,
    maxDepth: input.maxDepth,
    maxReferences: input.maxReferences,
    readContent: async (path) => {
      const result = await readArchiveContentFile({
        sourceArchive: input.sourceArchive,
        relativePath: path,
        maxBytes: input.maxBytesPerFile ?? DEFAULT_MAX_BYTES,
        cache: input.cache
      });
      return {
        content: result.content,
        skipped: result.skipped
      };
    },
    truncated: listed.truncated
  });

  return {
    sourceArchive: input.sourceArchive,
    ...trace
  };
}

export async function traceNestedModArchiveResourceReferences(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  startPaths: string[];
  maxDepth?: number;
  maxReferences?: number;
  maxBytesPerFile?: number;
}): Promise<ModArchiveResourceReferenceTrace> {
  const listed = await listNestedArchiveContent({
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.embeddedArchivePath,
    domains: ["assets"]
  });
  const entriesByPath = new Set(
    listed.entries.map((entry) => entry.relativePath)
  );
  const startPaths = unique(input.startPaths).filter(isTraceableAssetPath);
  const trace = await traceResourceReferences({
    entriesByPath,
    startPaths,
    maxDepth: input.maxDepth,
    maxReferences: input.maxReferences,
    readContent: async (path) => {
      const result = await readNestedArchiveContentFile({
        sourceArchive: input.sourceArchive,
        embeddedArchivePath: input.embeddedArchivePath,
        relativePath: path,
        maxBytes: input.maxBytesPerFile ?? DEFAULT_MAX_BYTES
      });
      return {
        content: result.content,
        skipped: result.skipped
      };
    },
    truncated: listed.truncated
  });

  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: listed.embeddedArchivePath,
    ...trace
  };
}

async function traceResourceReferences(input: {
  entriesByPath: Set<string>;
  startPaths: string[];
  maxDepth?: number;
  maxReferences?: number;
  readContent: (
    path: string
  ) => Promise<{ content?: string; skipped?: ArchiveContentSkippedEntry }>;
  truncated: boolean;
}): Promise<Omit<ModArchiveResourceReferenceTrace, "sourceArchive" | "embeddedArchivePath">> {
  const references: ModArchiveResourceReference[] = [];
  const skipped: ArchiveContentSkippedEntry[] = [];
  const visited = new Set<string>();
  const queue = input.startPaths.map((path) => ({ depth: 0, path }));
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxReferences = input.maxReferences ?? DEFAULT_MAX_REFERENCES;
  let truncated = input.truncated;

  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined || visited.has(item.path)) {
      continue;
    }

    visited.add(item.path);
    const read = await input.readContent(item.path);
    if (read.skipped) {
      skipped.push(read.skipped);
      continue;
    }
    if (read.content === undefined) {
      continue;
    }

    const parsed = parseJson(read.content, item.path);
    if (parsed.skipped) {
      skipped.push(parsed.skipped);
      continue;
    }

    for (const reference of collectReferences(item.path, parsed.value, input.entriesByPath)) {
      references.push(reference);

      if (
        reference.status === "resolved" &&
        reference.toKind === "models" &&
        item.depth < maxDepth
      ) {
        queue.push({ depth: item.depth + 1, path: reference.toPath });
      }

      if (references.length >= maxReferences) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  return {
    startPaths: input.startPaths,
    references,
    unresolved: references.filter((reference) => reference.status === "missing"),
    skipped,
    truncated
  };
}

function collectReferences(
  fromPath: string,
  value: unknown,
  entriesByPath: Set<string>
): ModArchiveResourceReference[] {
  const fromKind = classifyTraceAssetKind(fromPath);
  if (fromKind === "blockstates") {
    return collectNamedStrings(value, "model").map((model) =>
      createReference({
        entriesByPath,
        fromKind,
        fromPath,
        relation: "blockstate_model",
        toKind: "models",
        toPath: toModelPath(model, namespaceFromPath(fromPath)),
        value: model
      })
    );
  }
  if (fromKind !== "models" || !isRecord(value)) {
    return [];
  }

  const references: ModArchiveResourceReference[] = [];
  if (typeof value.parent === "string") {
    references.push(
      createReference({
        entriesByPath,
        fromKind,
        fromPath,
        relation: "model_parent",
        toKind: "models",
        toPath: toModelPath(value.parent, namespaceFromPath(fromPath)),
        value: value.parent
      })
    );
  }
  if (isRecord(value.textures)) {
    for (const texture of collectStringValues(value.textures)) {
      if (texture.startsWith("#")) {
        continue;
      }
      references.push(
        createReference({
          entriesByPath,
          fromKind,
          fromPath,
          relation: "model_texture",
          toKind: "textures",
          toPath: toTexturePath(texture, namespaceFromPath(fromPath)),
          value: texture
        })
      );
    }
  }
  return references;
}

function createReference(input: {
  entriesByPath: Set<string>;
  fromPath: string;
  fromKind: ModArchiveResourceReferenceKind;
  relation: ModArchiveResourceReferenceRelation;
  value: string;
  toPath: string;
  toKind: ModArchiveResourceReferenceKind;
}): ModArchiveResourceReference {
  return {
    fromPath: input.fromPath,
    fromKind: input.fromKind,
    relation: input.relation,
    value: input.value,
    toPath: input.toPath,
    toKind: input.toKind,
    status: input.entriesByPath.has(input.toPath) ? "resolved" : "missing"
  };
}

function toModelPath(value: string, defaultNamespace: string): string {
  const location = parseResourceLocation(value, defaultNamespace);
  return `assets/${location.namespace}/models/${location.path}.json`;
}

function toTexturePath(value: string, defaultNamespace: string): string {
  const location = parseResourceLocation(value, defaultNamespace);
  return `assets/${location.namespace}/textures/${location.path}.png`;
}

function parseResourceLocation(
  value: string,
  defaultNamespace: string
): { namespace: string; path: string } {
  const separator = value.indexOf(":");
  if (separator >= 0) {
    return {
      namespace: value.slice(0, separator),
      path: value.slice(separator + 1)
    };
  }

  return { namespace: defaultNamespace, path: value };
}

function namespaceFromPath(relativePath: string): string {
  return relativePath.split("/")[1] ?? "minecraft";
}

function classifyTraceAssetKind(path: string): ModArchiveResourceReferenceKind {
  const segment = path.split("/")[2];
  if (segment === "blockstates" || segment === "models" || segment === "textures") {
    return segment;
  }
  return "other";
}

function collectNamedStrings(value: unknown, key: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNamedStrings(item, key));
  }
  if (!isRecord(value)) {
    return [];
  }

  const matches =
    typeof value[key] === "string" ? [value[key] as string] : [];
  const nested = Object.values(value).flatMap((item) =>
    collectNamedStrings(item, key)
  );
  return unique([...matches, ...nested]);
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(collectStringValues);
  }
  return [];
}

function parseJson(
  content: string,
  relativePath: string
): { value?: unknown; skipped?: ArchiveContentSkippedEntry } {
  try {
    return { value: JSON.parse(content) };
  } catch {
    return { skipped: { relativePath, reason: "not-found" } };
  }
}

function isTraceableAssetPath(path: string): boolean {
  return /^assets\/[^/]+\/(?:blockstates|models)\//.test(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
