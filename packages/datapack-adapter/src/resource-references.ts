import type { DatapackKind, DatapackResourceReference } from "./types.js";
import { listDatapackFiles, readDatapackFile } from "./files.js";
import type {
  DatapackFileEntry,
  DatapackResourceReferenceRelation,
  DatapackResourceReferenceTrace,
  DatapackResourceReferenceTraceOptions,
  DatapackSkippedFile
} from "./types.js";

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_REFERENCES = 32;

export async function traceDatapackResourceReferences(
  root: string,
  options: DatapackResourceReferenceTraceOptions = {}
): Promise<DatapackResourceReferenceTrace> {
  const listed = await listDatapackFiles(root, {
    maxFiles: options.maxFiles,
    maxBytesPerFile: options.maxBytesPerFile
  });
  const entriesByPath = new Map(
    listed.entries.map((entry) => [entry.relativePath, entry])
  );
  const startPaths = unique(options.paths ?? []).filter((path) =>
    path.startsWith("assets/")
  );
  const references: DatapackResourceReference[] = [];
  const skipped: DatapackSkippedFile[] = [...listed.skipped];
  const visited = new Set<string>();
  const queue = startPaths.map((path) => ({ depth: 0, path }));
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxReferences = options.maxReferences ?? DEFAULT_MAX_REFERENCES;
  let truncated = listed.truncated;

  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined || visited.has(item.path)) {
      continue;
    }

    visited.add(item.path);
    const entry = entriesByPath.get(item.path);
    if (entry === undefined || !isTraceableAssetKind(entry.kind)) {
      continue;
    }

    const read = await readDatapackFile(root, item.path, {
      maxBytesPerFile: options.maxBytesPerFile
    });
    if (read.skipped) {
      skipped.push(read.skipped);
      continue;
    }
    if (read.content === undefined) {
      continue;
    }

    const parsed = parseJson(read.content, entry);
    if (parsed.skipped) {
      skipped.push(parsed.skipped);
      continue;
    }

    for (const reference of collectReferences(entry, parsed.value, entriesByPath)) {
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
    startPaths,
    references,
    unresolved: references.filter((reference) => reference.status === "missing"),
    skipped,
    truncated
  };
}

function collectReferences(
  entry: DatapackFileEntry,
  value: unknown,
  entriesByPath: Map<string, DatapackFileEntry>
): DatapackResourceReference[] {
  if (entry.kind === "blockstates") {
    return collectBlockstateReferences(entry, value, entriesByPath);
  }
  if (entry.kind === "items") {
    return collectItemReferences(entry, value, entriesByPath);
  }
  if (entry.kind === "models") {
    return collectModelReferences(entry, value, entriesByPath);
  }
  if (entry.kind === "particles") {
    return collectTextureReferences({
      entry,
      entriesByPath,
      relation: "particle_texture",
      values: collectNamedStrings(value, "textures")
    });
  }
  if (entry.kind === "atlases") {
    return collectTextureReferences({
      entry,
      entriesByPath,
      relation: "atlas_texture",
      values: collectNamedStrings(value, "resource")
    });
  }
  if (entry.kind === "font") {
    return collectTextureReferences({
      entry,
      entriesByPath,
      relation: "font_texture",
      values: collectNamedStrings(value, "file")
    });
  }
  return [];
}

function collectBlockstateReferences(
  entry: DatapackFileEntry,
  value: unknown,
  entriesByPath: Map<string, DatapackFileEntry>
): DatapackResourceReference[] {
  return collectNamedStrings(value, "model").map((model) =>
    createReference({
      entry,
      entriesByPath,
      relation: "blockstate_model",
      toKind: "models",
      toPath: toModelPath(model, entry.namespace),
      value: model
    })
  );
}

function collectItemReferences(
  entry: DatapackFileEntry,
  value: unknown,
  entriesByPath: Map<string, DatapackFileEntry>
): DatapackResourceReference[] {
  return collectNamedStrings(value, "model").map((model) =>
    createReference({
      entry,
      entriesByPath,
      relation: "item_model",
      toKind: "models",
      toPath: toModelPath(model, entry.namespace),
      value: model
    })
  );
}

function collectModelReferences(
  entry: DatapackFileEntry,
  value: unknown,
  entriesByPath: Map<string, DatapackFileEntry>
): DatapackResourceReference[] {
  if (!isRecord(value)) {
    return [];
  }

  const references: DatapackResourceReference[] = [];
  if (typeof value.parent === "string") {
    references.push(
      createReference({
        entry,
        entriesByPath,
        relation: "model_parent",
        toKind: "models",
        toPath: toModelPath(value.parent, entry.namespace),
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
          entry,
          entriesByPath,
          relation: "model_texture",
          toKind: "textures",
          toPath: toTexturePath(texture, entry.namespace),
          value: texture
        })
      );
    }
  }

  return references;
}

function collectTextureReferences(input: {
  entry: DatapackFileEntry;
  entriesByPath: Map<string, DatapackFileEntry>;
  relation: DatapackResourceReferenceRelation;
  values: string[];
}): DatapackResourceReference[] {
  return unique(input.values)
    .filter((value) => !value.startsWith("#"))
    .map((value) =>
      createReference({
        entry: input.entry,
        entriesByPath: input.entriesByPath,
        relation: input.relation,
        toKind: "textures",
        toPath: toTexturePath(value, input.entry.namespace),
        value
      })
    );
}

function createReference(input: {
  entry: DatapackFileEntry;
  entriesByPath: Map<string, DatapackFileEntry>;
  relation: DatapackResourceReferenceRelation;
  toKind: DatapackKind;
  toPath: string;
  value: string;
}): DatapackResourceReference {
  return {
    fromPath: input.entry.relativePath,
    fromKind: input.entry.kind,
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
  const path = location.path.endsWith(".png")
    ? location.path.slice(0, -".png".length)
    : location.path;
  return `assets/${location.namespace}/textures/${path}.png`;
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

  return {
    namespace: defaultNamespace,
    path: value
  };
}

function collectNamedStrings(value: unknown, key: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNamedStrings(item, key));
  }
  if (!isRecord(value)) {
    return [];
  }

  const matches = collectDirectStringValues(value[key]);
  const nested = Object.values(value).flatMap((item) =>
    collectNamedStrings(item, key)
  );
  return unique([...matches, ...nested]);
}

function collectDirectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
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
  entry: DatapackFileEntry
): { value?: unknown; skipped?: DatapackSkippedFile } {
  try {
    return { value: JSON.parse(content) };
  } catch {
    return {
      skipped: {
        absolutePath: entry.absolutePath,
        relativePath: entry.relativePath,
        reason: "unreadable"
      }
    };
  }
}

function isTraceableAssetKind(kind: DatapackKind): boolean {
  return (
    kind === "atlases" ||
    kind === "blockstates" ||
    kind === "font" ||
    kind === "items" ||
    kind === "models" ||
    kind === "particles"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
