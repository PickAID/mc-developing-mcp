export type SourcePackageId = string;

export type SourcePackageNamespace =
  | "minecraft"
  | "neoforge"
  | "forge"
  | "fabric"
  | "quilt"
  | `mod/${string}`;

export type SourcePackageArtifactType =
  | "source-pack"
  | "source-index"
  | "datapack"
  | "resource-pack"
  | "assets"
  | "docs/core"
  | "docs/search"
  | "docs/ui"
  | "docs/rendering"
  | "docs/shader"
  | "docs/coremod"
  | "distilled-patterns"
  | "api-proof-index";

export type SourcePackageVariant = "named" | "official" | "intermediary";

export type SourcePackageConfirmationScope = "package-version";

export type SourcePackageConfirmationSource = "explicit-user-confirmation";

export interface SourcePackageCoordinate {
  packageId: SourcePackageId;
  namespace: SourcePackageNamespace;
  minecraftVersion: string;
  artifactType: SourcePackageArtifactType;
  variant: SourcePackageVariant;
}

export interface SourcePackageManifest extends SourcePackageCoordinate {
  provenance: string;
  installedAt: string;
  stepKinds: string[];
  fileCount?: number;
  capabilities?: string[];
  docDomains?: string[];
  sourceDomains?: string[];
  credentialPolicy?: {
    required: boolean;
    envVars: string[];
    summary: string;
  };
  evidenceAuthority?: "required-backend" | "optional-accelerator" | "local-derived";
  migrationCoverage?: string[];
}

export interface SourcePackageConfirmation extends SourcePackageCoordinate {
  scope: SourcePackageConfirmationScope;
  approvedAt: string;
  source: SourcePackageConfirmationSource;
}

export type SourcePackageInstallStatus =
  | "needs_confirmation"
  | "installing"
  | "ready"
  | "install_validation_failed"
  | "install_failed";

export interface SourcePackageInstallState extends SourcePackageCoordinate {
  status: SourcePackageInstallStatus;
  updatedAt: string;
  installPath?: string;
  error?: string;
  confirmation?: SourcePackageConfirmation;
}

export type SourcePackageEnsureResult =
  | {
      status: "needs_confirmation";
      package: SourcePackageCoordinate;
      confirmationScope: SourcePackageConfirmationScope;
      summary: string;
    }
  | {
      status: "installing";
      package: SourcePackageCoordinate;
      summary: string;
    }
  | {
      status: "ready";
      package: SourcePackageCoordinate;
      installState: SourcePackageInstallState;
      summary: string;
    }
  | {
      status: "install_validation_failed";
      package: SourcePackageCoordinate;
      installState: SourcePackageInstallState;
      error: string;
      summary: string;
    }
  | {
      status: "install_failed";
      package: SourcePackageCoordinate;
      installState: SourcePackageInstallState;
      error: string;
      summary: string;
    };

export type VanillaSourceResolveStatus =
  | "ready"
  | "needs_confirmation"
  | "version_unresolved"
  | "backend_missing"
  | "acquisition_failed"
  | "install_validation_failed"
  | "installed_but_no_match";
