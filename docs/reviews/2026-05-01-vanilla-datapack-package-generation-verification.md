# Vanilla Datapack Package Generation Verification
Date: 2026-05-01
Author: m1hono
Scope: `packages/source-package-manager`, `packages/shared-types`

## Purpose
本切片补上“原版 datapack 内容不进仓库、由用户确认后本地生成”的底层能力。

现在 source package manager 可以：

- 表达 `artifactType: "datapack"` 的本地包。
- 从已有官方 jar/zip 中只提取 `data/**`。
- 从 Mojang/Piston 风格 manifest 找到版本 metadata，再找到 server/client archive URL。
- 下载 archive 到 runtime downloads 后提取 `data/**` 到 runtime installs。
- 继续沿用 `ensureSourcePackageInstalled` 的 explicit confirmation gate，未确认时不会下载或安装。

## Red Phase
Command:

```bash
pnpm exec vitest run packages/source-package-manager/src/executor.test.ts
```

Observed failure:

```text
Test Files  1 failed (1)
Tests  1 failed | 2 passed (3)

TypeError: buildVanillaDataPackArchiveRecipe is not a function
```

Second red command:

```bash
pnpm exec vitest run packages/source-package-manager/src/install.test.ts
```

Observed failure:

```text
Test Files  1 failed (1)
Tests  1 failed | 6 passed (7)

TypeError: buildMojangVanillaDataPackRecipeProvider is not a function
```

## Green Phase
Targeted command:

```bash
pnpm exec vitest run \
  packages/source-package-manager/src/executor.test.ts \
  packages/source-package-manager/src/install.test.ts
```

Observed result:

```text
Test Files  2 passed (2)
Tests  10 passed (10)
```

Package verification:

```text
pnpm --filter @mcpskill/source-package-manager test

Test Files  3 passed (3)
Tests  12 passed (12)
```

Full verification:

```text
pnpm test

Test Files  103 passed (103)
Tests  324 passed (324)
```

Guards:

```text
git diff --check
# no output

find apps packages tests ... '*.ts' '*.tsx' ... | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
# no output

find . ... -name '*.go' -o -name 'go.mod' -o -name 'go.sum'
# no output
```

## Actual Method Return
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temporary runtime, writes explicit confirmation, serves
# Mojang-style version manifest/version JSON/server jar through data: URLs,
# then calls ensureSourcePackageInstalled with buildMojangVanillaDataPackRecipeProvider.
TS
```

Observed compact output:

```json
{
  "status": "ready",
  "summary": "Executed 2 recipe step(s) for minecraft-26.1.2-vanilla-datapack-official.",
  "packageId": "minecraft-26.1.2-vanilla-datapack-official",
  "manifest": {
    "packageId": "minecraft-26.1.2-vanilla-datapack-official",
    "namespace": "minecraft",
    "minecraftVersion": "26.1.2",
    "artifactType": "datapack",
    "variant": "official",
    "provenance": "mojang-piston-manifest",
    "stepKinds": [
      "extract_remote_archive_content",
      "write_package_manifest"
    ],
    "fileCount": 1
  },
  "recipePreview": "{\"type\":\"minecraft:crafting_shapeless\"}"
}
```

The fixture archive also included `assets/minecraft/lang/en_us.json`; it was not installed because this package is datapack-only and extracts only `data/**`.

## Changed Behavior
- `SourcePackageArtifactType` now allows `"datapack"`.
- New recipe step: `extract_archive_content`.
- New recipe step: `extract_remote_archive_content`.
- New helper: `buildVanillaDataPackArchiveRecipe(...)`.
- New helper: `buildVanillaDataPackRemoteArchiveRecipe(...)`.
- New provider: `buildMojangVanillaDataPackRecipeProvider(...)`.

## Boundary
This is still a bottom-layer package capability, not yet a public MCP route.

Remaining work:

- Add MCP-side status/install/read UX for generated vanilla datapack packages.
- Add schema/migration consumers that use this generated package.
- Add a sibling vanilla assets package path for `assets/**` rather than mixing assets into datapack packages.
