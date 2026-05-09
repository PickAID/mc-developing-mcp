import type {
  KubeJsSemanticResourceEntry,
  KubeJsSemanticResourceKind
} from "./types.js";

const SEMANTIC_KINDS: KubeJsSemanticResourceKind[] = [
  "snippet",
  "item",
  "recipe",
  "registry",
  "fluid",
  "tag",
  "language_key",
  "class"
];

export function createEmptySemanticEntries(): Record<
  KubeJsSemanticResourceKind,
  KubeJsSemanticResourceEntry[]
> {
  return {
    snippet: [],
    item: [],
    recipe: [],
    registry: [],
    fluid: [],
    tag: [],
    language_key: [],
    class: []
  };
}

export function isSemanticKind(value: string): value is KubeJsSemanticResourceKind {
  return SEMANTIC_KINDS.includes(value as KubeJsSemanticResourceKind);
}
