import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate,
  SourcePackageId,
  SourcePackageManifest
} from "@mcpskill/shared-types";
import type { ArchiveContentDomain } from "@mcpskill/jar-source-adapter";

export type SourcePackageRecipeStep =
  | {
      kind: "copy_tree";
      sourceRoot: string;
    }
  | {
      kind: "extract_java_sources_zip";
      sourceZip: string;
    }
  | {
      kind: "extract_archive_content";
      sourceArchive: string;
      domains: ArchiveContentDomain[];
    }
  | {
      kind: "extract_remote_archive_content";
      sourceUrl: string;
      downloadFileName: string;
      domains: ArchiveContentDomain[];
    }
  | {
      kind: "build_source_index";
      databaseFileName?: string;
      maxFiles?: number;
      maxBytesPerFile?: number;
    }
  | {
      kind: "write_package_manifest";
    };

export interface SourcePackageRecipe extends SourcePackageCoordinate {
  provenance: string;
  steps: SourcePackageRecipeStep[];
}

export interface SourcePackageRecipeExecutionResult {
  installPath: string;
  summary: string;
  manifest?: SourcePackageManifest;
  fileCount?: number;
  sourceIndex?: {
    databasePath: string;
    fileCount: number;
    javaSymbolCount: number;
    indexedTextFileCount: number;
  };
}

export type SourcePackageRecipeRegistry = Record<
  SourcePackageId,
  SourcePackageRecipe
>;

export type SourcePackageRecipeProvider = (
  sourcePackage: SourcePackageCoordinate
) => Promise<SourcePackageRecipe | undefined>;

export interface SourcePackageRecipeExecutionInput {
  runtimeLayout: ManagedRuntimeLayout;
  recipe: SourcePackageRecipe;
}

export type SourcePackageRecipeExecutor = (
  input: SourcePackageRecipeExecutionInput
) => Promise<SourcePackageRecipeExecutionResult>;
