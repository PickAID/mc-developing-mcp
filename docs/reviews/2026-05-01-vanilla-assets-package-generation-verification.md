# Vanilla Assets Package Generation Verification
Date: 2026-05-01
Author: m1hono
Scope: `packages/source-package-manager`, `packages/shared-types`

## Purpose
本切片补上官方 vanilla `assets/**` 的本地生成包能力。

原则和 vanilla datapack package 相同：

- Mojang 原始内容不进仓库。
- 用户显式确认后才允许本地下载/安装。
- package manager 只负责生成和安装底层 package。
- 本切片不新增 MCP public tool，也暂不把 assets package 接进 `source.bundle`。

## Red Phase
Command:

```bash
pnpm exec vitest run \
  packages/source-package-manager/src/executor.test.ts \
  packages/source-package-manager/src/install.test.ts
```

Observed failure:

```text
Test Files  2 failed (2)
Tests  2 failed | 10 passed (12)

TypeError: (0 , buildVanillaAssetsArchiveRecipe) is not a function
TypeError: (0 , buildMojangVanillaAssetsRecipeProvider) is not a function
```

## Green Phase
Targeted command:

```bash
pnpm exec vitest run \
  packages/source-package-manager/src/executor.test.ts \
  packages/source-package-manager/src/install.test.ts \
  packages/source-package-manager/src/vanilla-provider.test.ts
```

Observed result:

```text
Test Files  3 passed (3)
Tests  12 passed (12)
```

Package command:

```bash
pnpm --filter @mcpskill/source-package-manager test
```

Observed result:

```text
Test Files  4 passed (4)
Tests  14 passed (14)
```

## Actual Method Return
Command shape:

```bash
cd packages/source-package-manager
pnpm exec tsx <<'TS'
# Creates a temporary runtime.
# Writes explicit confirmation for minecraft-26.1.2-vanilla-assets-official.
# Provides a Mojang-style version manifest through data: URLs.
# Calls ensureSourcePackageInstalled with buildMojangVanillaAssetsRecipeProvider.
TS
```

Observed compact output:

```json
{
  "status": "ready",
  "summary": "Executed 2 recipe step(s) for minecraft-26.1.2-vanilla-assets-official.",
  "packageId": "minecraft-26.1.2-vanilla-assets-official",
  "installPathKind": "managed-source-package-install",
  "manifest": {
    "packageId": "minecraft-26.1.2-vanilla-assets-official",
    "minecraftVersion": "26.1.2",
    "artifactType": "assets",
    "variant": "official",
    "provenance": "mojang-piston-manifest",
    "stepKinds": [
      "extract_remote_archive_content",
      "write_package_manifest"
    ],
    "fileCount": 1
  },
  "assetPreview": "{\"parent\":\"minecraft:item/generated\"}"
}
```

The fixture archive also contained `data/minecraft/recipe/stone.json`; it was intentionally not installed because this package extracts only `assets/**`.

## Changed Behavior
- `SourcePackageArtifactType` now includes `"assets"`.
- New helper: `buildVanillaAssetsCoordinate(...)`.
- New helper: `buildVanillaAssetsArchiveRecipe(...)`.
- New helper: `buildVanillaAssetsRemoteArchiveRecipe(...)`.
- New provider: `buildMojangVanillaAssetsRecipeProvider(...)`.
- Mojang archive resolution is shared with datapack generation:
  - datapack packages prefer `downloads.server` and fall back to `downloads.client`;
  - assets packages prefer `downloads.client` and fall back to `downloads.server`.

## Boundaries
Implemented:

- Bottom-layer generated vanilla assets packages.
- Confirmation-gated install path through existing source package manager.
- Local archive and remote Mojang/Piston manifest recipe paths.
- `assets/**`-only extraction, with `data/**` excluded.

Not implemented in this slice:

- MCP-side vanilla assets evidence fallback.
- Resource reference tracing over generated vanilla assets packages.
- Asset semantic validation or resource-pack migration analysis.
