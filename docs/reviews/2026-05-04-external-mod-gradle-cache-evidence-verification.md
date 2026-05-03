# External Mod Gradle Cache Evidence Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice adds internal `external_mod_resolution` evidence from Gradle-declared
dependencies and local Gradle module-cache JARs before Modrinth or CurseForge
remote lookup.

The behavior remains behind the existing `context.query` route. No public MCP
tool was added.

## Red
Focused dependency/cache red test:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts
```

Observed failure before implementation:

```text
× external mod resolution Gradle dependency evidence > uses declared Gradle cache jars before remote Modrinth lookup
  → Remote Modrinth resolver must not run.
```

Focused metadata red test:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts -t "matches declared Gradle cache jar metadata"
```

Observed failure before metadata inspection:

```text
× external mod resolution Gradle dependency evidence > matches declared Gradle cache jar metadata before remote lookup
  → Remote Modrinth resolver must not run.
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts (2 tests) 8ms

Test Files  1 passed (1)
Tests  2 passed (2)
```

Related regression:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-gradle-evidence.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/external-mod-resolution-local-archives.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts packages/gradle-adapter/src/build-dependencies.test.ts packages/gradle-adapter/src/dependency-binary-archives.test.ts packages/jar-source-adapter/src/mod-archives.test.ts
```

Result:

```text
Test Files  8 passed (8)
Tests  23 passed (23)
```

Typecheck:

```bash
pnpm typecheck
```

Result:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  119 passed (119)
Tests  392 passed (392)
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
          "sourceFile": "build.gradle",
          "modId": "local_energy",
          "title": "Local Energy",
          "loader": "fabric",
          "metadataPath": "fabric.mod.json",
          "archivePath": "<temp-gradle-home>/caches/modules-2/files-2.1/org.widgets/energy-core/1.0.0/hash/energy-core-1.0.0.jar",
          "fileName": "energy-core-1.0.0.jar",
          "archiveSource": "gradle-cache",
          "archiveReason": "declared Gradle dependency org.widgets:energy-core:1.0.0 in build.gradle",
          "mavenArtifacts": [
            {
              "source": "maven-repository",
              "repositoryName": "Gradle build.gradle",
              "repositoryUrl": "https://maven.widgets.example/releases",
              "group": "org.widgets",
              "artifact": "energy-core",
              "version": "1.0.0",
              "coordinates": "org.widgets:energy-core:1.0.0",
              "aliases": [],
              "gradle": {
                "repositoryGroovy": "maven { url = \"https://maven.widgets.example/releases\" }",
                "repositoryKotlin": "maven(\"https://maven.widgets.example/releases\")",
                "loom": {
                  "modImplementation": "modImplementation \"org.widgets:energy-core:1.0.0\"",
                  "modCompileOnly": "modCompileOnly \"org.widgets:energy-core:1.0.0\"",
                  "modRuntimeOnly": "modRuntimeOnly \"org.widgets:energy-core:1.0.0\"",
                  "modLocalRuntime": "modLocalRuntime \"org.widgets:energy-core:1.0.0\""
                },
                "forgeGradle": {
                  "implementationFgDeobf": "implementation fg.deobf(\"org.widgets:energy-core:1.0.0\")",
                  "compileOnlyFgDeobf": "compileOnly fg.deobf(\"org.widgets:energy-core:1.0.0\")",
                  "runtimeOnlyFgDeobf": "runtimeOnly fg.deobf(\"org.widgets:energy-core:1.0.0\")"
                }
              }
            }
          ],
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
- The Gradle cache archive source is now represented as `gradle-cache`, not as
  workspace `mods/` or `libs/` evidence.
- The JAR metadata does not declare Minecraft versions, so the result only
  claims loader and metadata/name evidence. It preserves the requested Minecraft
  version in the request object without over-claiming version compatibility.
