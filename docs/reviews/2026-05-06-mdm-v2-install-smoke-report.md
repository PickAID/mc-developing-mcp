# MDM v2 Install Smoke Report

Date: 2026-05-06

## Scope

This report records the actual local verification for the `mdm-sources` to
`resource-registry` v2 package path.

The smoke test copies the sibling `mdm-sources` repository into a temporary
directory, runs its real local release builder for selected channels
(`required` and `datapack`), reads the produced release manifest, converts
release summaries into v2 package manifests, caches one artifact through the
installer path, then opens the cached artifact payload.

## Actual Method Returns

`readMdmReleaseManifestFile(...)`

```json
{
  "schemaVersion": 1,
  "packageCount": 3,
  "packages": [
    "core-docs-required",
    "core-docs-required-v2",
    "minecraft-1.20.1-vanilla-datapack-profile"
  ]
}
```

`toPackageManifestsV2(...)` confirmed these package contracts:

```json
[
  {
    "packageId": "minecraft-1.20.1-vanilla-datapack-profile",
    "artifactKind": "datapack_bundle",
    "queryAdapter": "archive_content",
    "releaseChannel": "datapack"
  }
]
```

`ensureMdmReleasePackageCached(...)` for
`minecraft-1.20.1-vanilla-datapack-profile` returned:

```json
{
  "status": "downloaded",
  "packageId": "minecraft-1.20.1-vanilla-datapack-profile"
}
```

`summarizeMdmResourceStatus(...)` after caching returned:

```json
{
  "ready": 1
}
```

The cached artifact was opened and contained:

```json
{
  "payload/datapack-profile.json": {
    "repoPath": "packages/datapack/vanilla/1.20.1/payload/datapack-profile.json"
  }
}
```

## Commands

```sh
pnpm --filter @mcpskill/resource-registry test
pnpm --filter @mcpskill/package-registry test
pnpm --filter @mcpskill/source-package-manager test
cd ../mdm-sources && node --test tests/*.test.mjs
cd ../mdm-sources && node tools/validate.mjs
```

## Results

```text
@mcpskill/resource-registry: 30 tests passed
@mcpskill/package-registry: 14 tests passed
@mcpskill/source-package-manager: 52 tests passed
mdm-sources node tests: 9 tests passed
mdm-sources validate: packageCount 5, errorCount 0
```

## Findings

The smoke test found one real mismatch before the fix: the legacy v1
`core-docs-required` package declared non-v2 capability names. The package now
uses `docs_search` and `docs_direct_read`.

The smoke test also forced `mdm-sources` datapack/resourcepack/mapping profiles
to use the same query-adapter semantics as the MCP v2 contract:
`archive_content` for datapack/resourcepack profiles and `mapping_index` for
mapping profiles. The builder now supports channel selection, so MCP smoke does
not need a monolithic all-channel release to install one datapack package.
