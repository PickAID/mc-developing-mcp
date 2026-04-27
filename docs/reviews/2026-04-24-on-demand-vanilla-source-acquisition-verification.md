# On-Demand Vanilla Source Acquisition Verification
Date: 2026-04-24
Author: m1hono
Status: PASS

## Scope
- validate the new typed source-package recipe executor end to end
- enforce post-install manifest validation instead of treating any install path as `ready`
- propagate `install_validation_failed` through `source-package-manager` and `vanilla-source-adapter`
- verify that `source.bundle` still only handles explicit vanilla source requests
- capture actual runtime JSON returns from the internal TypeScript flow

## Files
- `packages/shared-types/src/source-packages.ts`
- `packages/source-package-manager/src/contracts.ts`
- `packages/source-package-manager/src/executor.ts`
- `packages/source-package-manager/src/executor.test.ts`
- `packages/source-package-manager/src/install.ts`
- `packages/source-package-manager/src/install.test.ts`
- `packages/source-package-manager/src/manifest.ts`
- `packages/source-package-manager/src/validation.ts`
- `packages/source-package-manager/src/vanilla.ts`
- `packages/vanilla-source-adapter/src/resolve.ts`
- `packages/vanilla-source-adapter/src/resolve.test.ts`
- `apps/mcp-server/src/source-bundle-executor.ts`
- `apps/mcp-server/src/source-bundle-executor.test.ts`
- `apps/mcp-server/testdata/on-demand-vanilla-source.ts`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/source-package-manager/src/executor.test.ts packages/source-package-manager/src/install.test.ts packages/vanilla-source-adapter/src/resolve.test.ts apps/mcp-server/src/source-bundle-executor.test.ts
pnpm typecheck
pnpm test
pnpm --filter @mcpskill/mcp-server exec tsx testdata/on-demand-vanilla-source.ts
```

## Command Results

### Focused verification suite
- Command: `pnpm exec vitest run packages/source-package-manager/src/executor.test.ts packages/source-package-manager/src/install.test.ts packages/vanilla-source-adapter/src/resolve.test.ts apps/mcp-server/src/source-bundle-executor.test.ts`
- Exit code: `0`

```text
✓ packages/source-package-manager/src/executor.test.ts (1 test) 7ms
✓ packages/source-package-manager/src/install.test.ts (5 tests) 13ms
✓ packages/vanilla-source-adapter/src/resolve.test.ts (6 tests) 13ms
✓ apps/mcp-server/src/source-bundle-executor.test.ts (3 tests) 11ms

Test Files  4 passed (4)
     Tests  15 passed (15)
Duration  414ms
```

### Workspace typecheck
- Command: `pnpm typecheck`
- Exit code: `0`
- stdout/stderr: empty

### Full workspace test suite
- Command: `pnpm test`
- Exit code: `0`

```text
Test Files  31 passed (31)
     Tests  101 passed (101)
Duration  1.04s
```

### Runtime sample script
- Command: `pnpm --filter @mcpskill/mcp-server exec tsx testdata/on-demand-vanilla-source.ts`
- Exit code: `0`

## Direct Runtime Samples

### `ensureSourcePackageInstalled`

```json
{
  "needsConfirmation": {
    "status": "needs_confirmation",
    "package": {
      "packageId": "minecraft-1.20.1-source-pack-named",
      "namespace": "minecraft",
      "minecraftVersion": "1.20.1",
      "artifactType": "source-pack",
      "variant": "named"
    },
    "confirmationScope": "package-version",
    "summary": "Source package minecraft-1.20.1-source-pack-named requires explicit confirmation before installation."
  },
  "ready": {
    "result": {
      "status": "ready",
      "summary": "Executed 2 recipe step(s) for minecraft-1.20.1-source-pack-named."
    },
    "installState": {
      "status": "ready",
      "installPath": "/var/folders/.../mcpskill-runtime-sample-*/installs/source-packages/minecraft/1.20.1/source-pack/named"
    },
    "manifest": {
      "packageId": "minecraft-1.20.1-source-pack-named",
      "namespace": "minecraft",
      "minecraftVersion": "1.20.1",
      "artifactType": "source-pack",
      "variant": "named",
      "provenance": "materialized-local-copy",
      "installedAt": "2026-04-24T13:50:14.267Z",
      "stepKinds": ["copy_tree", "write_package_manifest"],
      "fileCount": 1
    }
  },
  "installValidationFailed": {
    "result": {
      "status": "install_validation_failed",
      "error": "Source package minecraft-1.20.1-source-pack-named is missing source-package.manifest.json after installation.",
      "summary": "Source package minecraft-1.20.1-source-pack-named is missing source-package.manifest.json after installation."
    },
    "installState": {
      "status": "install_validation_failed",
      "installPath": "/var/folders/.../mcpskill-invalid-install-*",
      "error": "Source package minecraft-1.20.1-source-pack-named is missing source-package.manifest.json after installation."
    }
  }
}
```

### `resolveVanillaSource`

```json
{
  "ready": {
    "status": "ready",
    "minecraftVersion": "1.20.1",
    "packageId": "minecraft-1.20.1-source-pack-named",
    "references": [
      {
        "relativePath": "net/minecraft/world/item/ItemStack.java",
        "content": "package net.minecraft.world.item;\npublic class ItemStack {}\n",
        "reason": "exact vanilla source pack match"
      }
    ],
    "summary": "Resolved 1 vanilla source file(s) from minecraft-1.20.1-source-pack-named."
  },
  "installValidationFailed": {
    "status": "install_validation_failed",
    "minecraftVersion": "1.20.1",
    "packageId": "minecraft-1.20.1-source-pack-named",
    "summary": "Source package minecraft-1.20.1-source-pack-named is missing source-package.manifest.json after installation.",
    "error": "Source package minecraft-1.20.1-source-pack-named is missing source-package.manifest.json after installation."
  }
}
```

### `source.bundle` internal executor

```json
{
  "unmatched": {
    "matched": false,
    "summary": "No vanilla source request detected for source.bundle."
  },
  "ready": {
    "matched": true,
    "summary": "Resolved 1 vanilla source file(s) from minecraft-1.20.1-source-pack-named.",
    "payload": {
      "source": "vanilla_source",
      "request": {
        "symbol": "net.minecraft.world.item.ItemStack"
      },
      "result": {
        "status": "ready",
        "minecraftVersion": "1.20.1",
        "packageId": "minecraft-1.20.1-source-pack-named",
        "references": [
          {
            "relativePath": "net/minecraft/world/item/ItemStack.java",
            "reason": "exact vanilla source pack match"
          }
        ]
      }
    }
  }
}
```

## Observations
- Post-install validation is now real. A missing `source-package.manifest.json` becomes `install_validation_failed` instead of silently producing a fake `ready`.
- The runtime sample exposed a manifest leak during verification: `buildSourcePackageManifest()` was spreading the whole recipe object and accidentally writing `steps` into the manifest. That was fixed before this verification was finalized, and `executor.test.ts` now asserts that `steps` is absent.
- `source.bundle` remains narrow. Non-vanilla workspace-source requests still return `matched: false`, which keeps the public MCP surface progressive instead of turning into a catch-all source fetcher.
- The current acquisition backend is still a local materialized-copy recipe. That is intentional for this slice. Real upstream vanilla acquisition and user-confirmed generation remain the next implementation step.
