# Gradle Subproject Dependency Evidence Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice expands static Gradle dependency discovery from root
`build.gradle(.kts)` files to included subproject build files declared in
`settings.gradle(.kts)`.

This lets `external_mod_resolution` reuse the existing Gradle cache evidence
chain for multi-module Java mod workspaces without executing Gradle.

## Red
Package red test:

```bash
pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts -t "included Gradle subprojects"
```

Observed failure before implementation:

```text
× readGradleDeclaredDependencies > reads dependency declarations from included Gradle subprojects
  → expected [] to match object [ Array(2) ]
```

MCP integration red test before rebuilding workspace package output:

```bash
pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts
```

Observed stale-package failure:

```text
× external mod resolution Gradle dependency evidence > uses declared Gradle subproject cache jars before remote lookup
  → Remote Modrinth resolver must not run.
```

The package-level red test was the real missing behavior. The MCP red exposed
that focused Vitest runs against workspace package imports need `tsc -b` first
when a package implementation changed.

## Green
Focused package green:

```bash
pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts -t "included Gradle subprojects"
```

Result:

```text
✓ packages/gradle-adapter/src/build-dependencies.test.ts (4 tests | 3 skipped) 5ms

Test Files  1 passed (1)
Tests  1 passed | 3 skipped (4)
```

Typecheck plus focused integration:

```bash
pnpm typecheck && pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts
```

Result:

```text
✓ packages/gradle-adapter/src/build-dependencies.test.ts (4 tests) 12ms
✓ apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts (3 tests) 11ms

Test Files  2 passed (2)
Tests  7 passed (7)
```

Related regression:

```bash
pnpm typecheck && pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts packages/gradle-adapter/src/dependency-binary-archives.test.ts packages/gradle-adapter/src/dependency-source-archives.test.ts apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts
```

Result:

```text
Test Files  8 passed (8)
Tests  23 passed (23)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  119 passed (119)
Tests  394 passed (394)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Value
Fixture:

```text
settings.gradle declares include ":common"
common/build.gradle declares modImplementation "org.widgets:energy-core:1.0.0"
Gradle user home contains modules-2/files-2.1/org.widgets/energy-core/1.0.0/hash/energy-core-1.0.0.jar
JAR contains fabric.mod.json with id=local_energy, name=Local Energy, version=1.0.0
```

Request:

```text
Find the Modrinth mod for Local Energy fabric 1.20.1.
```

Return value:

```json
{
  "matched": true,
  "summary": "Resolved Gradle dependency archive: org.widgets:energy-core:1.0.0.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "modrinth",
      "query": "local energy",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    },
    "result": {
      "source": "gradle_dependency_archive",
      "query": "local energy",
      "candidates": [
        {
          "source": "gradle_dependency_archive",
          "confidence": "high",
          "confidenceReasons": [
            "matched Gradle cache mod metadata Local Energy",
            "metadata found at fabric.mod.json",
            "loader fabric matched requested loader",
            "found binary jar in gradle-cache"
          ],
          "group": "org.widgets",
          "artifact": "energy-core",
          "version": "1.0.0",
          "coordinate": "org.widgets:energy-core:1.0.0",
          "sourceFile": "common/build.gradle",
          "modId": "local_energy",
          "title": "Local Energy",
          "loader": "fabric",
          "metadataPath": "fabric.mod.json",
          "archivePath": "<temp-gradle-home>/caches/modules-2/files-2.1/org.widgets/energy-core/1.0.0/hash/energy-core-1.0.0.jar",
          "fileName": "energy-core-1.0.0.jar",
          "archiveSource": "gradle-cache",
          "archiveReason": "declared Gradle dependency org.widgets:energy-core:1.0.0 in common/build.gradle",
          "mavenArtifacts": [],
          "requiresConfirmation": false,
          "cachePolicy": "metadata_only"
        }
      ],
      "warnings": [],
      "scannedDependencies": 1,
      "scannedArchives": 1,
      "remoteLookupSkipped": true
    }
  }
}
```

## Notes
- Static parsing currently supports `include ":a"` and `include(":a", ":b:c")`
  style declarations.
- It intentionally does not execute Gradle and does not yet evaluate custom
  `project(":x").projectDir = file("...")` mappings.
