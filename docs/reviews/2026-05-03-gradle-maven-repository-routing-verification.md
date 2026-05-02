# Gradle Maven Repository Routing Verification
Date: 2026-05-03
Author: m1hono
Scope: `@mcpskill/gradle-adapter`, `@mcpskill/mcp-server`

## Summary
Added Gradle-derived Maven repository priority for MCP external mod resolution.

Implemented behavior:

- `@mcpskill/gradle-adapter` can extract Maven repositories from `build.gradle`, `build.gradle.kts`, `settings.gradle`, and `settings.gradle.kts`.
- Supported declarations include `maven { url = "..." }`, `maven { url "..." }`, `maven("...")`, `mavenCentral()`, `google()`, and `gradlePluginPortal()`.
- MCP `external_mod_resolution` now reads workspace Gradle repositories when a Maven coordinate omits an explicit repository URL.
- Explicit repository URLs in the user request still win over Gradle-derived repositories.
- Gradle repositories are passed internally; no new public MCP tool was added.

## Red Phase
Command:

```bash
pnpm exec vitest run packages/gradle-adapter/src/build-repositories.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Expected failures before implementation:

```text
FAIL packages/gradle-adapter/src/build-repositories.test.ts
Error: Cannot find module './build-repositories.js'

FAIL apps/mcp-server/src/request-executor-external-mod.test.ts
expected cacheTrace.hits from https://maven.example/releases
received unresolved Maven result from the default inferred repository
```

## Green Phase
Command:

```bash
pnpm exec vitest run packages/gradle-adapter/src/build-repositories.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Result:

```text
✓ packages/gradle-adapter/src/build-repositories.test.ts (2 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (4 tests)

Test Files  2 passed (2)
Tests  6 passed (6)
```

## Actual MCP Values
Command:

```bash
pnpm exec tsx <<'TS'
// Create a workspace build.gradle with repositories { maven { url = "https://maven.example/releases" } }
// Preload runtimeRoot Maven metadata cache, then resolve com.example:demo-mod without an explicit URL.
TS
```

Observed compact result:

```json
{
  "summary": "Resolved external mod Maven coordinates: com.example:demo-mod:1.2.4.",
  "request": {
    "platform": "maven",
    "coordinate": "com.example:demo-mod"
  },
  "repository": "Gradle build.gradle",
  "repositoryUrl": "https://maven.example/releases",
  "cacheTrace": {
    "hits": [
      "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
    ],
    "misses": [],
    "writes": []
  },
  "firstCandidate": {
    "fileName": "demo-mod-1.2.4.jar",
    "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4.jar"
  }
}
```

## Residual Risks
- Repository extraction is static text parsing, not Gradle Tooling API execution. This is intentional for low-cost MCP evidence, but dynamic repository blocks still need Gradle/LSP-backed enhancement later.
- Repository ranking currently preserves Gradle file scan order and source order. Future work should combine this with dependency ownership and local Gradle cache evidence.
- Multi-module repository discovery is not recursive yet.
