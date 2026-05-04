import type { AgentRuntimeTaskIntentId } from "./runtime.js";

export type DocsPackageOrigin = "crychicdoc" | "mdm" | "official" | "curated" | "external-api";

export type DocsPackageDomain =
  | "kubejs"
  | "datapack"
  | "java-mod"
  | "resource-pack"
  | "client-visual"
  | "ui"
  | "rendering"
  | "shader"
  | "coremod"
  | "migration";

export type DocsPackageKind =
  | "course"
  | "concept"
  | "event-catalog"
  | "addon-guide"
  | "api-proof"
  | "resource-layout"
  | "upgrade-note"
  | "format-reference"
  | "shader-reference"
  | "migration-map";

export interface DocsPackageQuerySignals {
  queryTerms: string[];
  addonNames: string[];
  scriptScopes: string[];
  eventNames: string[];
  assetKinds?: string[];
  resourceFormats?: string[];
  shaderTerms?: string[];
  apiSymbols?: string[];
  migrationTerms?: string[];
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
