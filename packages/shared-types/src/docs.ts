import type { AgentRuntimeTaskIntentId } from "./runtime.js";

export type DocsPackageOrigin = "crychicdoc";

export type DocsPackageDomain = "kubejs" | "datapack" | "java-mod";

export type DocsPackageKind =
  | "course"
  | "concept"
  | "event-catalog"
  | "addon-guide"
  | "resource-layout"
  | "upgrade-note";

export interface DocsPackageQuerySignals {
  queryTerms: string[];
  addonNames: string[];
  scriptScopes: string[];
  eventNames: string[];
}

export interface DocsPackageVersionFence {
  minecraftVersions: string[];
  strict: boolean;
}

export interface DocsPackageManifest {
  packageId: string;
  origin: DocsPackageOrigin;
  title: string;
  language: string;
  domain: DocsPackageDomain;
  summary: string;
  minecraftVersions: string[];
  preferredIntents: AgentRuntimeTaskIntentId[];
  kinds: DocsPackageKind[];
  topics: string[];
  querySignals: DocsPackageQuerySignals;
  versionFence: DocsPackageVersionFence;
}
