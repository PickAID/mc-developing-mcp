# Gradle Binary Classifier Evidence Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice lets Gradle dependency binary discovery accept runtime classifier JARs
from the local Gradle module cache, such as `-all`, `-shadow`, `-dev`, or
`-remapped`, while continuing to exclude documentation/source classifiers.

The MCP `external_mod_resolution` Gradle-cache evidence path now reuses the same
binary-name rule instead of requiring the exact `<artifact>-<version>.jar` file.

## Red
Package red test:

```bash
pnpm vitest run packages/gradle-adapter/src/dependency-binary-archives.test.ts -t "runtime classifier"
```

Observed failure before implementation:

```text
× discoverDeclaredDependencyBinaryArchives > locates runtime classifier jars and skips documentation classifiers
  → expected [] to match object [ …(2) ]
```

MCP integration red test after rebuilding workspace package output:

```bash
pnpm typecheck && pnpm vitest run apps/mcp-server/src/external-mod-resolution-gradle-variant-evidence.test.ts
```

Observed failure before MCP evidence matching was updated:

```text
× external mod resolution Gradle dependency variant evidence > uses declared Gradle classifier cache jars before remote lookup
  → Remote Modrinth resolver must not run.
```

## Green
Focused green:

```bash
pnpm typecheck && pnpm vitest run packages/gradle-adapter/src/dependency-binary-archives.test.ts apps/mcp-server/src/external-mod-resolution-gradle-variant-evidence.test.ts
```

Result:

```text
✓ packages/gradle-adapter/src/dependency-binary-archives.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/external-mod-resolution-gradle-variant-evidence.test.ts (1 test) 7ms

Test Files  2 passed (2)
Tests  3 passed (3)
```

Related regression:

```bash
pnpm typecheck && pnpm vitest run packages/gradle-adapter/src/dependency-binary-archives.test.ts packages/gradle-adapter/src/build-dependencies.test.ts packages/gradle-adapter/src/dependency-source-archives.test.ts apps/mcp-server/src/external-mod-resolution-gradle-variant-evidence.test.ts apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts
```

Result:

```text
Test Files  9 passed (9)
Tests  27 passed (27)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  120 passed (120)
Tests  398 passed (398)
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
build.gradle declares modImplementation "org.widgets:energy-core:1.0.0"
Gradle user home contains modules-2/files-2.1/org.widgets/energy-core/1.0.0/hash/energy-core-1.0.0-all.jar
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
          "sourceFile": "build.gradle",
          "modId": "local_energy",
          "title": "Local Energy",
          "loader": "fabric",
          "metadataPath": "fabric.mod.json",
          "archivePath": "<temp-gradle-home>/caches/modules-2/files-2.1/org.widgets/energy-core/1.0.0/hash/energy-core-1.0.0-all.jar",
          "fileName": "energy-core-1.0.0-all.jar",
          "archiveSource": "gradle-cache",
          "archiveReason": "declared Gradle dependency org.widgets:energy-core:1.0.0 in build.gradle",
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
- Excluded classifier tokens: `sources`, `source`, `javadoc`, `docs`, `doc`,
  and `kdoc`.
- The classifier rule is intentionally conservative: it only matches files under
  the declared Gradle coordinate directory and still requires the
  `<artifact>-<version>-<classifier>.jar` prefix.
