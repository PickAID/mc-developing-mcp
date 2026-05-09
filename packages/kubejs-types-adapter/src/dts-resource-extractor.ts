import type {
  KubeJsSemanticResourceEntry,
  KubeJsSemanticResourceKind,
  KubeJsTypeResourceFile
} from "./types.js";

const RESOURCE_LITERAL = /(["'])(#?[a-z0-9_.-]+:[a-z0-9_./-]+)\1/gi;

export function extractDtsResourceLiteralEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  const entries = new Map<string, KubeJsSemanticResourceEntry>();

  for (const match of content.matchAll(RESOURCE_LITERAL)) {
    const value = match[2];
    const context = declarationContext(content, match.index ?? 0);
    const sourceKind = inferResourceKind(value, context);
    if (!sourceKind) {
      continue;
    }

    const name = sourceKind === "tag" ? value.replace(/^#/, "") : value;
    const key = `${sourceKind}:${name}`;
    if (entries.has(key)) {
      continue;
    }

    entries.set(key, {
      sourceKind,
      extractorId: "probe-dts-resource-literal-v1",
      sourceFormat: "probe-dts-resource-literal",
      confidence: 0.72,
      name,
      value: sourceKind === "tag" ? `#${name}` : value,
      file,
      lineNumber: lineNumberAt(content, match.index ?? 0),
      metadata: registryMetadata(sourceKind, context)
    });
  }

  return [...entries.values()];
}

function inferResourceKind(
  value: string,
  context: string
): KubeJsSemanticResourceKind | undefined {
  const normalized = context.toLowerCase();
  if (value.startsWith("#") || normalized.includes("tag")) {
    return "tag";
  }
  if (normalized.includes("fluid")) {
    return "fluid";
  }
  if (normalized.includes("registry") || normalized.includes("registries")) {
    return "registry";
  }
  if (normalized.includes("recipe") || normalized.includes("recipes")) {
    return "recipe";
  }
  if (normalized.includes("item") || normalized.includes("ingredient")) {
    return "item";
  }
  return undefined;
}

function registryMetadata(
  sourceKind: KubeJsSemanticResourceKind,
  context: string
) {
  if (sourceKind !== "registry") {
    return undefined;
  }

  const registryType = context.match(/\btype([A-Z][A-Za-z0-9_]*)\b/)?.[1];
  return registryType ? { registryType } : undefined;
}

function declarationContext(content: string, index: number): string {
  const before = content.slice(0, index);
  const after = content.slice(index);
  const start = Math.max(
    before.lastIndexOf("declare "),
    before.lastIndexOf("type "),
    before.lastIndexOf("interface ")
  );
  const endOffset = after.indexOf(";");
  const end = endOffset >= 0 ? index + endOffset + 1 : index + 80;
  return content.slice(Math.max(0, start), Math.min(content.length, end));
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}
