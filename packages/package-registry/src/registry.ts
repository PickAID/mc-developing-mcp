export interface PackageRecord {
  packageId: string;
}

export interface PackageRegistry<TPackage extends PackageRecord> {
  packages: TPackage[];
  packageIds: string[];
  byId: Record<string, TPackage>;
}

export function buildPackageRegistry<TPackage extends PackageRecord>(
  packages: TPackage[]
): PackageRegistry<TPackage> {
  const byId: Record<string, TPackage> = {};
  const packageIds: string[] = [];

  for (const pkg of packages) {
    if (pkg.packageId in byId) {
      throw new Error(`duplicate packageId: ${pkg.packageId}`);
    }

    byId[pkg.packageId] = pkg;
    packageIds.push(pkg.packageId);
  }

  return {
    packages: [...packages],
    packageIds,
    byId
  };
}

export function findPackageById<TPackage extends PackageRecord>(
  registry: PackageRegistry<TPackage>,
  packageId: string
): TPackage | undefined {
  return registry.byId[packageId];
}
