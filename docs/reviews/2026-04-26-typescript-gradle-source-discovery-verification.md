# TypeScript Gradle Source Discovery Verification
Date: 2026-04-26
Author: m1hono
Status: PASS

## Scope
- add Gradle sources jar discovery to `@mcpskill/gradle-adapter`
- add lazy source package recipe providers so cache scans run only after confirmation / install need
- wire `source.bundle` to discover vanilla source archives from Gradle cache
- keep `source.bundle` as the only MCP source path for vanilla source acquisition
- verify the runtime sample now resolves through Gradle cache discovery
- remove stale `dist/java-source-zip.*` build artifacts after moving archive extraction to `jar-source-adapter`

## Files
- `packages/gradle-adapter/src/source-archives.ts`
- `packages/gradle-adapter/src/source-archives.test.ts`
- `packages/gradle-adapter/src/index.ts`
- `packages/gradle-adapter/package.json`
- `packages/source-package-manager/src/contracts.ts`
- `packages/source-package-manager/src/install.ts`
- `packages/source-package-manager/src/install.test.ts`
- `packages/vanilla-source-adapter/src/resolve.ts`
- `apps/mcp-server/src/source-bundle-executor.ts`
- `apps/mcp-server/src/source-bundle-executor.test.ts`
- `apps/mcp-server/testdata/on-demand-vanilla-source.ts`
- `apps/mcp-server/package.json`
- `apps/mcp-server/tsconfig.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm --filter @mcpskill/gradle-adapter test
pnpm --filter @mcpskill/source-package-manager test
pnpm --filter @mcpskill/mcp-server test
pnpm exec vitest run apps/mcp-server/src/source-bundle-executor.test.ts packages/gradle-adapter/src/source-archives.test.ts packages/source-package-manager/src/install.test.ts
pnpm --filter @mcpskill/mcp-server exec tsx testdata/on-demand-vanilla-source.ts
pnpm typecheck
pnpm test
find . -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find . -path './node_modules' -prune -o -name '*java-source-zip*' -print
```

## Results

### Gradle adapter package
- Exit code: `0`

```text
✓ packages/gradle-adapter/src/source-archives.test.ts (2 tests) 19ms

Test Files  1 passed (1)
     Tests  2 passed (2)
```

### Source package manager package
- Exit code: `0`

```text
✓ packages/source-package-manager/src/executor.test.ts (2 tests) 17ms
✓ packages/source-package-manager/src/confirmation.test.ts (2 tests) 10ms
✓ packages/source-package-manager/src/install.test.ts (6 tests) 37ms

Test Files  3 passed (3)
     Tests  10 passed (10)
```

### MCP server package
- Exit code: `0`

```text
✓ apps/mcp-server/src/source-bundle-executor.test.ts (4 tests) 29ms

Test Files  10 passed (10)
     Tests  24 passed (24)
```

### Focused cross-package suite
- Exit code: `0`

```text
✓ packages/gradle-adapter/src/source-archives.test.ts (2 tests) 12ms
✓ packages/source-package-manager/src/install.test.ts (6 tests) 29ms
✓ apps/mcp-server/src/source-bundle-executor.test.ts (4 tests) 17ms

Test Files  3 passed (3)
     Tests  12 passed (12)
```

### Workspace typecheck
- Exit code: `0`
- stdout/stderr: empty

### Full workspace test suite
- Exit code: `0`

```text
Test Files  33 passed (33)
     Tests  107 passed (107)
Duration  691ms
```

### Go cleanup scan
- Exit code: `0`
- Output: empty

### Stale source-package-manager archive helper scan
- Exit code: `0`
- Output: empty

## Runtime Samples

### Gradle source archive discovery
The adapter finds both workspace-local sources jars and configured Gradle cache sources jars, then filters Minecraft candidates by runtime version.

```json
[
  {
    "archivePath": ".../.gradle/caches/modules-2/files-2.1/net.minecraft/client/1.20.1/hash/client-1.20.1-sources.jar",
    "source": "gradle-cache",
    "confidence": "high"
  }
]
```

### Lazy recipe provider
`ensureSourcePackageInstalled(...)` now accepts a `recipeProvider`. The provider is called after confirmation and only when the package is not already installed.

```json
{
  "status": "ready",
  "package": {
    "packageId": "minecraft-1.20.1-source-pack-named",
    "namespace": "minecraft",
    "minecraftVersion": "1.20.1",
    "artifactType": "source-pack",
    "variant": "named"
  }
}
```

### `source.bundle` with Gradle cache discovery
The runtime sample creates a configured Gradle cache entry at:

```text
caches/modules-2/files-2.1/net.minecraft/client/1.20.1/hash/client-1.20.1-sources.jar
```

Then `source.bundle` resolves without an explicit recipe registry:

```json
{
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
```

## Notes
- Default discovery scans only targeted roots: workspace `libs`, workspace `build/libs`, workspace `.gradle/caches/modules-2/files-2.1`, and Gradle user home module cache.
- Scans are budgeted by `maxVisitedEntries` and `maxResults`.
- Explicit `recipes` still take precedence over lazy discovery.
- Discovery is not run before user confirmation because `ensureSourcePackageInstalled(...)` checks confirmation before recipe lookup.
- This does not yet download Mojang artifacts or decompile jars. It makes existing Gradle cache sources jars usable by the MCP.
