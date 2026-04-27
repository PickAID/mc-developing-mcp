# Source Package Manager Product Sample
Date: 2026-04-26
Author: m1hono
Status: PASS

## Purpose
Show the current package manager product shape, not just unit-test assertions.

## Command
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm --filter @mcpskill/source-package-manager exec tsx testdata/source-package-product.ts
pnpm --filter @mcpskill/source-package-manager test
pnpm typecheck
```

## Results
- `source-package-product.ts`: exit code `0`
- `@mcpskill/source-package-manager test`: `3` test files passed, `10` tests passed
- `pnpm typecheck`: exit code `0`

## Product Layout
The sample created a runtime root like:

```text
/var/folders/.../mcpskill-package-product-*
```

Inside that runtime root:

```text
downloads/
  fixture-sources.jar
installs/
  source-packages/
    minecraft/
      1.20.1/
        source-pack/
          named/
            net/minecraft/world/item/ItemStack.java
            source-package.manifest.json
locks/
  source-packages/
    minecraft-1.20.1-source-pack-named.confirmation.json
    minecraft-1.20.1-source-pack-named.install-state.json
```

## State Transitions

Before explicit confirmation:

```json
{
  "status": "needs_confirmation",
  "confirmationScope": "package-version",
  "summary": "Source package minecraft-1.20.1-source-pack-named requires explicit confirmation before installation."
}
```

After confirmation and first install:

```json
{
  "status": "ready",
  "summary": "Executed 2 recipe step(s) for minecraft-1.20.1-source-pack-named."
}
```

Second ensure call:

```json
{
  "status": "ready",
  "summary": "Source package minecraft-1.20.1-source-pack-named is already installed."
}
```

## Manifest

```json
{
  "packageId": "minecraft-1.20.1-source-pack-named",
  "namespace": "minecraft",
  "minecraftVersion": "1.20.1",
  "artifactType": "source-pack",
  "variant": "named",
  "provenance": "java-sources-zip",
  "stepKinds": ["extract_java_sources_zip", "write_package_manifest"],
  "fileCount": 1
}
```

## Installed Source Preview

```java
package net.minecraft.world.item;
public class ItemStack {}
```

## Maturity Assessment
Current mature enough:
- local runtime layout
- package coordinate model
- explicit package-version confirmation
- install state transitions
- repeat ensure no-op behavior
- Java sources jar ingestion
- manifest writing and validation
- Gradle cache discovery for existing sources jars

Not mature yet:
- remote package registry and release download
- checksum / digest verification for downloaded payloads
- real vanilla source generation from Mojang manifests, mappings, decompile, and remap
- generic mod package classification and install recipes
- datapack/assets extraction from mod jars
- source-index generation and cache eviction
- real file locking / concurrent install protection beyond the `installing` state marker
