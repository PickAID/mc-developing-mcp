# TypeScript Sources Jar Acquisition Verification
Date: 2026-04-26
Author: m1hono
Status: PASS

## Scope
- remove the stale Go implementation tree from `SKillUpdate`
- add real Java source archive extraction to `@mcpskill/jar-source-adapter`
- let `@mcpskill/source-package-manager` install source packages from sources jar/zip recipes
- switch the vanilla runtime sample from directory-copy materialization to `java-sources-zip`
- keep the public MCP surface unchanged

## Files
- `packages/jar-source-adapter/src/java-source-archive.ts`
- `packages/jar-source-adapter/src/java-source-archive.test.ts`
- `packages/jar-source-adapter/src/index.ts`
- `packages/jar-source-adapter/package.json`
- `packages/source-package-manager/src/contracts.ts`
- `packages/source-package-manager/src/executor.ts`
- `packages/source-package-manager/src/executor.test.ts`
- `packages/source-package-manager/src/vanilla.ts`
- `packages/source-package-manager/package.json`
- `packages/source-package-manager/tsconfig.json`
- `apps/mcp-server/testdata/on-demand-vanilla-source.ts`

## Removed
- `cmd/`
- `internal/`
- `go.mod`
- `go.sum` if present

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
find . -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
pnpm --filter @mcpskill/jar-source-adapter test
pnpm --filter @mcpskill/source-package-manager test
pnpm typecheck
pnpm --filter @mcpskill/mcp-server exec tsx testdata/on-demand-vanilla-source.ts
pnpm test
```

## Results

### Go cleanup scan
- Exit code: `0`
- Output: empty

No `.go`, `go.mod`, or `go.sum` files remain outside `node_modules`.

### Jar source adapter test
- Exit code: `0`

```text
✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 6ms

Test Files  1 passed (1)
     Tests  1 passed (1)
```

### Source package manager test
- Exit code: `0`

```text
✓ packages/source-package-manager/src/confirmation.test.ts (2 tests) 8ms
✓ packages/source-package-manager/src/executor.test.ts (2 tests) 12ms
✓ packages/source-package-manager/src/install.test.ts (5 tests) 13ms

Test Files  3 passed (3)
     Tests  9 passed (9)
```

### Workspace typecheck
- Exit code: `0`
- stdout/stderr: empty

### Full workspace test suite
- Exit code: `0`

```text
Test Files  32 passed (32)
     Tests  103 passed (103)
Duration  760ms
```

## Runtime Return Samples

### Source package install from sources jar
`apps/mcp-server/testdata/on-demand-vanilla-source.ts` now creates a deflated sources jar and installs it through `buildVanillaSourcePackZipRecipe(...)`.

```json
{
  "status": "ready",
  "summary": "Executed 2 recipe step(s) for minecraft-1.20.1-source-pack-named.",
  "manifest": {
    "packageId": "minecraft-1.20.1-source-pack-named",
    "provenance": "java-sources-zip",
    "stepKinds": ["extract_java_sources_zip", "write_package_manifest"],
    "fileCount": 1
  }
}
```

### Vanilla source resolution after sources jar install

```json
{
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
}
```

### Source bundle still stays narrow

```json
{
  "unmatched": {
    "matched": false,
    "summary": "No vanilla source request detected for source.bundle."
  },
  "ready": {
    "matched": true,
    "summary": "Resolved 1 vanilla source file(s) from minecraft-1.20.1-source-pack-named."
  }
}
```

## Notes
- The jar adapter supports stored and deflated ZIP/JAR entries and extracts only `.java` files.
- Archive path traversal is ignored during extraction.
- This is a real source archive ingestion path for Gradle cache, generated vanilla sources, and external library sources jars.
- It does not yet download Mojang artifacts or run a decompiler. That remains the next backend step for fully generated vanilla source packs.
