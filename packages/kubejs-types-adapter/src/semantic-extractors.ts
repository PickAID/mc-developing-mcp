import {
  isClassDefinitionsFile,
  isCodeSnippetFile,
  isFluidAttributesFile,
  isItemAttributesFile,
  isItemTagAttributesFile,
  isLangKeysFile,
  isLegacyClassesFile,
  isRegistryDefinitionsFile
} from "./semantic-files.js";
import { isSemanticKind } from "./semantic-kinds.js";
import type {
  KubeJsSemanticResourceEntry,
  KubeJsSemanticResourceKind,
  KubeJsSemanticSourceFormat,
  KubeJsTypeResourceFile
} from "./types.js";

export { canExtractKubeJsSemanticResource, semanticReadBudget } from "./semantic-files.js";
export { createEmptySemanticEntries } from "./semantic-kinds.js";

export function extractKubeJsSemanticResourceEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  if (isCodeSnippetFile(file)) {
    return extractCodeSnippetEntries(file, content);
  }
  if (isItemAttributesFile(file)) {
    return extractItemAttributeEntries(file, content);
  }
  if (isFluidAttributesFile(file)) {
    return extractFluidAttributeEntries(file, content);
  }
  if (isItemTagAttributesFile(file)) {
    return extractItemTagAttributeEntries(file, content);
  }
  if (isLangKeysFile(file)) {
    return extractLangKeyEntries(file, content);
  }
  if (isClassDefinitionsFile(file)) {
    return extractClassDefinitionEntries(file, content);
  }
  if (isRegistryDefinitionsFile(file)) {
    return extractRegistryDefinitionEntries(file, content);
  }
  if (isLegacyClassesFile(file)) {
    return extractLegacyClassEntries(file, content);
  }
  if (isSemanticKind(file.sourceKind)) {
    return extractLineEntries(file, content, file.sourceKind);
  }
  return [];
}

function extractCodeSnippetEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return extractLineEntries(file, content, "snippet", {
      confidence: 0.4,
      warnings: ["snippet_json_parse_failed"]
    });
  }

  return Object.entries(parsed).map(([name, value]) => ({
    sourceKind: "snippet",
    extractorId: "vscode-code-snippets-json-v1",
    sourceFormat: "vscode-code-snippets-json",
    confidence: 0.95,
    name,
    value: normalizeSnippetPrefix(value) ?? name,
    file,
    metadata: normalizeSnippetDescription(value)
  }));
}

function extractItemAttributeEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  return parseJsonArray(content).flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return [];
    }

    return [{
      sourceKind: "item",
      extractorId: "vscode-item-attributes-json-v1",
      sourceFormat: "vscode-item-attributes-json",
      confidence: 0.9,
      name: value.id,
      value: value.id,
      file,
      metadata: compactMetadata({
        label: typeof value.localized === "string"
          ? truncate(value.localized, 120)
          : undefined
      })
    }];
  });
}

function extractFluidAttributeEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  return parseJsonArray(content).flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return [];
    }

    return [{
      sourceKind: "fluid",
      extractorId: "vscode-fluid-attributes-json-v1",
      sourceFormat: "vscode-fluid-attributes-json",
      confidence: 0.9,
      name: value.id,
      value: value.id,
      file,
      metadata: compactMetadata({
        bucketItem: typeof value.bucketItem === "string"
          ? value.bucketItem
          : undefined,
        label: typeof value.localized === "string"
          ? truncate(value.localized, 120)
          : undefined
      })
    }];
  });
}

function extractItemTagAttributeEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  return parseJsonArray(content).flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return [];
    }

    return [{
      sourceKind: "tag",
      extractorId: "vscode-item-tag-attributes-json-v1",
      sourceFormat: "vscode-item-tag-attributes-json",
      confidence: 0.9,
      name: value.id,
      value: `#${value.id}`,
      file,
      metadata: compactMetadata({
        itemCount: Array.isArray(value.items) ? value.items.length : undefined
      })
    }];
  });
}

function extractLangKeyEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  return parseJsonArray(content).flatMap((value) => {
    if (!isRecord(value) || typeof value.key !== "string") {
      return [];
    }

    const selectedLanguage =
      typeof value.selected === "string" ? value.selected : undefined;
    const label = selectLanguageLabel(value.languages, selectedLanguage);

    return [{
      sourceKind: "language_key",
      extractorId: "vscode-lang-keys-json-v1",
      sourceFormat: "vscode-lang-keys-json",
      confidence: 0.9,
      name: value.key,
      value: value.key,
      file,
      metadata: compactMetadata({
        label,
        selectedLanguage
      })
    }];
  });
}

function extractClassDefinitionEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  const parsed = parseJsonObject(content);
  const definitions = isRecord(parsed?.definitions) ? parsed.definitions : undefined;
  const typeClassName = isRecord(definitions?.typeClassName)
    ? definitions.typeClassName
    : undefined;
  const classNames = Array.isArray(typeClassName?.enum)
    ? typeClassName.enum.filter((value): value is string => typeof value === "string")
    : [];

  return [...new Set(classNames)].map((className) => {
    const classMetadata = splitClassName(className);

    return {
      sourceKind: "class",
      extractorId: "probe-class-definitions-json-v1",
      sourceFormat: "probe-class-definitions-json",
      confidence: 0.85,
      name: className,
      value: className,
      file,
      metadata: compactMetadata(classMetadata)
    };
  });
}

function extractRegistryDefinitionEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  return Object.entries(parseJsonObject(content) ?? {}).flatMap(
    ([schemaName, schema]) => {
      if (!isRecord(schema) || !Array.isArray(schema.enum)) {
        return [];
      }

      return schema.enum.flatMap((value) => {
        if (typeof value !== "string") {
          return [];
        }

        return [{
          sourceKind: "registry",
          extractorId: "probe-registry-definitions-json-v1",
          sourceFormat: "probe-registry-definitions-json",
          confidence: 0.88,
          name: value,
          value,
          file,
          metadata: compactMetadata({
            registryType: normalizeRegistrySchemaName(schemaName)
          })
        }];
      });
    }
  );
}

function extractLegacyClassEntries(
  file: KubeJsTypeResourceFile,
  content: string
): KubeJsSemanticResourceEntry[] {
  const entries: KubeJsSemanticResourceEntry[] = [];
  let previousSegments: string[] = [];

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const className = expandLegacyClassName(line, previousSegments);
    if (!className) {
      continue;
    }
    previousSegments = className.split(".");
    entries.push({
      sourceKind: "class",
      extractorId: "probe-classes-text-v1",
      sourceFormat: "probe-classes-text",
      confidence: 0.78,
      name: className,
      value: className,
      file,
      lineNumber: index + 1,
      metadata: compactMetadata(splitClassName(className))
    });
  }

  return entries;
}

function extractLineEntries(
  file: KubeJsTypeResourceFile,
  content: string,
  sourceKind: KubeJsSemanticResourceKind,
  options: {
    confidence?: number;
    warnings?: string[];
  } = {}
): KubeJsSemanticResourceEntry[] {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0 && !line.startsWith("#"))
    .map(({ line, lineNumber }) => ({
      sourceKind,
      extractorId: "probejs-line-list-v1",
      sourceFormat: "text-line-list" satisfies KubeJsSemanticSourceFormat,
      confidence: options.confidence ?? 0.75,
      name: line,
      value: line,
      file,
      lineNumber,
      warnings: options.warnings
    }));
}

function parseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseJsonArray(content: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return [];
  }
  return [];
}

function normalizeSnippetPrefix(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return normalizeSnippetField(value.prefix);
}

function normalizeSnippetDescription(value: unknown) {
  if (!isRecord(value) || typeof value.description !== "string") {
    return undefined;
  }

  return { description: truncate(value.description, 500) };
}

function normalizeSnippetField(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").join(", ");
  }
  return undefined;
}

function selectLanguageLabel(
  languages: unknown,
  selectedLanguage: string | undefined
): string | undefined {
  if (!isRecord(languages)) {
    return undefined;
  }
  const candidates = [
    selectedLanguage,
    "en_us",
    "English",
    ...Object.keys(languages)
  ].filter((value): value is string => typeof value === "string");

  for (const candidate of candidates) {
    const label = languages[candidate];
    if (typeof label === "string") {
      return truncate(label, 120);
    }
  }
  return undefined;
}

function splitClassName(className: string) {
  const separatorIndex = className.lastIndexOf(".");
  if (separatorIndex < 0) {
    return { simpleName: className };
  }

  return {
    packageName: className.slice(0, separatorIndex),
    simpleName: className.slice(separatorIndex + 1)
  };
}

function normalizeRegistrySchemaName(schemaName: string): string {
  return schemaName.startsWith("type")
    ? schemaName.slice("type".length)
    : schemaName;
}

function expandLegacyClassName(
  line: string,
  previousSegments: string[]
): string | undefined {
  const indentation = line.match(/^\.+/)?.[0].length ?? 0;
  const suffix = line.slice(indentation);
  if (!suffix) {
    return undefined;
  }

  const expanded = indentation > 0
    ? [...previousSegments.slice(0, indentation), suffix].join(".")
    : suffix;
  return expanded.replaceAll(".$", ".");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compactMetadata<T extends Record<string, unknown>>(metadata: T): T | undefined {
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as T : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
