# Gradle ProjectDir Dependency Evidence Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice expands static Gradle dependency discovery to honor simple
workspace-relative `project(":x").projectDir = file("...")` mappings in
`settings.gradle(.kts)`.

The behavior stays static and safe: the MCP does not execute Gradle, does not
follow absolute paths, and does not follow `..` paths.

## Red
Focused red test:

```bash
pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts -t "projectDir mappings"
```

Observed failure before implementation:

```text
× readGradleDeclaredDependencies > honors static Gradle projectDir mappings for included subprojects
  → expected [] to deep equally contain { group: 'org.widgets', …(4) }
```

## Green
Focused green:

```bash
pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts -t "projectDir mappings"
```

Result:

```text
✓ packages/gradle-adapter/src/build-dependencies.test.ts (5 tests | 4 skipped) 8ms

Test Files  1 passed (1)
Tests  1 passed | 4 skipped (5)
```

Typecheck plus MCP integration:

```bash
pnpm typecheck && pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts
```

Result:

```text
✓ packages/gradle-adapter/src/build-dependencies.test.ts (5 tests) 14ms
✓ apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts (4 tests) 17ms

Test Files  2 passed (2)
Tests  9 passed (9)
```

Related regression:

```bash
pnpm typecheck && pnpm vitest run packages/gradle-adapter/src/build-dependencies.test.ts packages/gradle-adapter/src/dependency-binary-archives.test.ts packages/gradle-adapter/src/dependency-source-archives.test.ts apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts
```

Result:

```text
Test Files  8 passed (8)
Tests  25 passed (25)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  119 passed (119)
Tests  396 passed (396)
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
settings.gradle declares include ":api"
settings.gradle maps project(":api").projectDir = file("modules/api")
modules/api/build.gradle declares modImplementation "org.widgets:energy-core:1.0.0"
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
          "sourceFile": "modules/api/build.gradle",
          "modId": "local_energy",
          "title": "Local Energy",
          "loader": "fabric",
          "metadataPath": "fabric.mod.json",
          "archivePath": "<temp-gradle-home>/caches/modules-2/files-2.1/org.widgets/energy-core/1.0.0/hash/energy-core-1.0.0.jar",
          "fileName": "energy-core-1.0.0.jar",
          "archiveSource": "gradle-cache",
          "archiveReason": "declared Gradle dependency org.widgets:energy-core:1.0.0 in modules/api/build.gradle",
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
- Supported mapping shape: `project(":api").projectDir = file("modules/api")`
  and `File("modules/api")`.
- Unsupported by design in this slice: absolute project dirs, parent traversal,
  computed variables, and `new File(rootDir, "...")`.
