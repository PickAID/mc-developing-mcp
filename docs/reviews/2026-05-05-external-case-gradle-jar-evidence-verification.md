# External Case Gradle/JAR Evidence Verification

Date: 2026-05-05
Branch: `skill-update`
Task: GradleJar-A

## External Fixture Basis

Read-only external cases checked under `/Users/gedwen/Documents/programing/MC/_external`:

- `L2Weaponry/libs` uses binary/source pairs such as `l2core-3.0.8+11.jar` and `l2core-3.0.8+11-sources.jar`, with versions declared through `gradle.properties` placeholders like `${l2core_ver}`.
- `L2Core/libs` uses additional `+build` metadata pairs such as `l2library-3.0.2+4.jar` and `l2library-3.0.2+4-sources.jar`.
- `L2Artifacts/libs` uses runtime classifier binaries such as `l2library-2.4.24-slim.jar` and Gradle dependencies with versions like `${l2library_version}-slim`.
- JEI 1.20.1 uses multi-module Gradle KTS includes in `settings.gradle.kts`, already covered by existing included-project dependency scanning.

## Change Verified

The Gradle adapter now resolves simple `gradle.properties` placeholders inside dependency notations before archive discovery. Declared dependency binary discovery also checks workspace `libs/` and `build/libs/` flat directories, while preserving existing Gradle module cache behavior.

The MCP Gradle dependency evidence matcher now accepts workspace `libs` candidates by archive filename and maps them to `workspace-libs` for mod archive inspection.

## Actual Returned Shapes

Gradle adapter workspace libs discovery test returns:

```json
[
  {
    "archivePath": "<workspace>/libs/l2core-3.0.8+11.jar",
    "source": "workspace",
    "confidence": "high",
    "reason": "declared Gradle dependency dev.xkmc:l2core:3.0.8+11 in build.gradle; workspace libs directory"
  },
  {
    "archivePath": "<workspace>/libs/l2library-3.0.4-slim.jar",
    "source": "workspace",
    "confidence": "high",
    "reason": "declared Gradle dependency dev.xkmc:l2library:3.0.4-slim in build.gradle; workspace libs directory"
  }
]
```

MCP Gradle dependency evidence test returns a candidate containing:

```json
{
  "source": "gradle_dependency_archive",
  "query": "l2core",
  "scannedDependencies": 1,
  "scannedArchives": 1,
  "candidates": [
    {
      "source": "gradle_dependency_archive",
      "coordinate": "dev.xkmc:l2core:3.0.8+11",
      "group": "dev.xkmc",
      "artifact": "l2core",
      "version": "3.0.8+11",
      "modId": "l2core",
      "title": "L2Core",
      "loader": "neoforge",
      "metadataPath": "META-INF/neoforge.mods.toml",
      "archivePath": "<workspace>/libs/l2core-3.0.8+11.jar",
      "fileName": "l2core-3.0.8+11.jar",
      "archiveSource": "workspace",
      "archiveReason": "declared Gradle dependency dev.xkmc:l2core:3.0.8+11 in build.gradle; workspace libs directory"
    }
  ]
}
```

## Verification

- `pnpm --filter @mcpskill/gradle-adapter test`
- `pnpm exec tsc -b apps/mcp-server && pnpm exec vitest run --root . apps/mcp-server/src/external-mod-resolution-gradle-dependency-archives.test.ts apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts`
- `find packages/gradle-adapter/src apps/mcp-server/src -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'`

Line guard output was empty.

## Risks

- Property interpolation is intentionally simple and only resolves `${name}` from root `gradle.properties`; it does not evaluate arbitrary Gradle expressions.
- Workspace libs evidence is matched by declared artifact/version filename, not by Maven group, because flat directory jars do not encode group in the path.
