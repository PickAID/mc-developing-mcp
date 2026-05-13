import { isSemanticKind } from "./semantic-kinds.js";
import type {
  KubeJsTypeResourceFile,
  SummarizeKubeJsTypeResourcesOptions
} from "./types.js";

export function canExtractKubeJsSemanticResource(
  file: KubeJsTypeResourceFile
): boolean {
  return isSemanticKind(file.sourceKind) || isKnownSemanticFile(file);
}

export function semanticReadBudget(
  file: KubeJsTypeResourceFile,
  options: SummarizeKubeJsTypeResourcesOptions
): number | undefined {
  if (isCodeSnippetFile(file)) {
    return options.maxSnippetBytes;
  }
  if (isKnownJsonSemanticFile(file)) {
    return options.maxAttributeBytes;
  }
  return options.maxBytesPerFile;
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
