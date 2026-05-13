import type { ArchiveContentDomain } from "minecraft-developing-mcp-jar-source-adapter";
import type { VanillaSourceRequest } from "minecraft-developing-mcp-vanilla-source-adapter";

import type { McpServerExternalModResolutionRequest } from "../../external-mod/resolution/external-mod-resolution-request.js";

export interface McpOperationSourceAcquisitionInput {
  sourceIndexQuery?: string;
  minecraftVersion?: string;
  mapping?: {
    minecraftVersion?: string;
    family?: "yarn" | "parchment" | "mojmap";
  };
}

export interface McpOperationWorkspaceSourceInput {
  javaSymbols?: string[];
  javaPaths?: string[];
  buildFiles?: string[];
  line?: number;
}

export interface McpOperationProbeJsInput {
  symbol?: string;
  resourceQueries?: string[];
  resourceOnly?: boolean;
  scope?: "startup" | "server" | "client" | "shared";
  includeLifecycle?: boolean;
}

export interface McpOperationNestedArchiveEntryInput {
  embeddedArchivePath: string;
  relativePath: string;
}

export interface McpOperationModArchiveInput {
  archive?: string;
  queries?: string[];
  entryPaths?: string[];
  nestedEntryPaths?: McpOperationNestedArchiveEntryInput[];
  listDomains?: ArchiveContentDomain[];
  nestedListPath?: string;
  classOwners?: string[];
  mixinTargets?: string[];
  decompileClasses?: string[];
  inventory?: boolean;
  refreshInventory?: boolean;
  preDecompileAnalysis?: boolean;
  hotaiPatchProof?: boolean;
}

export interface McpOperationDatapackInput {
  resourceLocations?: string[];
  paths?: string[];
  traceReferences?: boolean;
  migration?: {
    fromMinecraftVersion: string;
    toMinecraftVersion: string;
  };
  mode?: "datapack" | "resource_pack" | "client_visual";
}

export interface McpOperationLogFilesInput {
  paths?: string[];
}

export interface McpOperationInput {
  docsQuery?: string;
  sourceAcquisition?: McpOperationSourceAcquisitionInput;
  workspaceSource?: McpOperationWorkspaceSourceInput;
  probeJs?: McpOperationProbeJsInput;
  modArchive?: McpOperationModArchiveInput;
  externalModRequests?: McpServerExternalModResolutionRequest[];
  datapack?: McpOperationDatapackInput;
  logFiles?: McpOperationLogFilesInput;
  vanillaSource?: VanillaSourceRequest;
}

