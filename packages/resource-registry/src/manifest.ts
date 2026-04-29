export interface MdmResourceRelease {
  artifactName: string;
  sha256: string;
  sizeBytes?: number;
  builtAt?: string;
}

export interface MdmResourcePackageDetail {
  schemaVersion: number;
  id: string;
  sourcePath: string;
  currentRelease: MdmResourceRelease | null;
}

export interface MdmResourcePackageSummary {
  id: string;
  manifestPath: string;
  required: boolean;
  format: string;
  currentRelease?: MdmResourceRelease | null;
  detail: MdmResourcePackageDetail;
}

export interface MdmResourceRegistry {
  root: string;
  schemaVersion: number;
  packages: MdmResourcePackageSummary[];
}
