# Resource Registry SQLite Package Status Verification

Date: 2026-05-05

## Scope

- Added optional resource package metadata at the `@mcpskill/resource-registry` bottom layer only.
- Kept MCP request execution, `apps/mcp-server`, and `packages/datapack-adapter` untouched.
- Preserved repository-manifest metadata while distinguishing private generated local caches.

## Behavior Added

- Package metadata can now describe `storageKind` as `sqlite_bundle`, `generated_local_cache`, `remote_manifest`, or `optional_accelerator`.
- Package metadata can now describe `installTier` as `required_docs`, `optional_dataset`, `optional_accelerator`, or `private_local_cache`.
- Package metadata carries `commitPolicy`, distinguishing `repository_manifest` from `private_generated_cache`.
- SQLite-oriented packages can include validation descriptors: `databaseName`, `minUserVersion`, and `requiredTables`.
- Local registry and release manifest readers resolve default metadata when manifests omit it.
- Status summaries now include resolved package metadata beside `missing_required`, `missing_optional`, `ready`, and `invalid_checksum`.

## Actual Return Shapes Covered

```ts
resolveMdmResourcePackageMetadata(
  {
    sqlite: {
      databaseName: "minecraft_docs.sqlite",
      minUserVersion: 3,
      requiredTables: ["documents", "documents_fts"]
    }
  },
  {
    packageId: "docs-sqlite-bundle",
    required: false,
    format: "sqlite",
    artifactType: "sqlite"
  }
)
```

Returns:

```ts
{
  storageKind: "sqlite_bundle",
  installTier: "optional_dataset",
  commitPolicy: "repository_manifest",
  sqlite: {
    databaseName: "minecraft_docs.sqlite",
    minUserVersion: 3,
    requiredTables: ["documents", "documents_fts"]
  }
}
```

```ts
resolveMdmResourcePackageMetadata(undefined, {
  packageId: "probejs-local-cache",
  required: false,
  format: "sqlite",
  sourcePath: "generated:probejs/global.d.ts"
})
```

Returns:

```ts
{
  storageKind: "generated_local_cache",
  installTier: "private_local_cache",
  commitPolicy: "private_generated_cache",
  sqlite: undefined
}
```

## Commands

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/resource-registry test
```

Result summary:

```text
Test Files  6 passed (6)
Tests       18 passed (18)
```

```sh
find packages/resource-registry/src -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Result summary:

```text
<no output; no resource-registry TS/TSX file exceeds 500 lines>
```

Largest changed file:

```text
205 packages/resource-registry/src/release-manifest.ts
```
