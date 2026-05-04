import { isSemanticKind } from "./semantic-kinds.js";
import type {
  KubeJsTypeResourceFile,
  SummarizeKubeJsTypeResourcesOptions
} from "./types.js";

const DEFAULT_LARGE_JSON_BYTES = 5_000_000;

export function canExtractKubeJsSemanticResource(
  file: KubeJsTypeResourceFile
): boolean {
  return isSemanticKind(file.sourceKind) || isKnownSemanticFile(file);
}

export function semanticReadBudget(
  file: KubeJsTypeResourceFile,
  options: SummarizeKubeJsTypeResourcesOptions
): number {
  if (isCodeSnippetFile(file)) {
    return options.maxSnippetBytes ?? DEFAULT_LARGE_JSON_BYTES;
  }
  if (isKnownJsonSemanticFile(file)) {
    return options.maxAttributeBytes ?? DEFAULT_LARGE_JSON_BYTES;
  }
  return options.maxBytesPerFile ?? 65_536;
}

export function isCodeSnippetFile(file: KubeJsTypeResourceFile): boolean {
  return file.sourceKind === "snippet" && file.relativePath.endsWith(".code-snippets");
}

export function isItemAttributesFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".vscode/item-attributes.json");
}

export function isFluidAttributesFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".vscode/fluid-attributes.json");
}

export function isItemTagAttributesFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".vscode/item-tag-attributes.json");
}

export function isLangKeysFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".vscode/lang-keys.json");
}

export function isClassDefinitionsFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".vscode/probe.class-definitions.json");
}

export function isRegistryDefinitionsFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".vscode/probe.registry-definitions.json");
}

export function isLegacyClassesFile(file: KubeJsTypeResourceFile): boolean {
  return file.relativePath.endsWith(".probe/classes.txt");
}

export function isProbeDeclarationFile(file: KubeJsTypeResourceFile): boolean {
  return file.sourceKind === "dts";
}

function isKnownSemanticFile(file: KubeJsTypeResourceFile): boolean {
  return (
    isKnownJsonSemanticFile(file) ||
    isLegacyClassesFile(file) ||
    isProbeDeclarationFile(file)
  );
}

function isKnownJsonSemanticFile(file: KubeJsTypeResourceFile): boolean {
  return (
    isItemAttributesFile(file) ||
    isFluidAttributesFile(file) ||
    isItemTagAttributesFile(file) ||
    isLangKeysFile(file) ||
    isClassDefinitionsFile(file) ||
    isRegistryDefinitionsFile(file)
  );
}
