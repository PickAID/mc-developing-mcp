# Maven Coordinate Resolution Verification
Date: 2026-05-02
Author: m1hono
Scope: `@mcpskill/external-mod-resolver`, `@mcpskill/mcp-server`

## Summary
Added Maven-first external mod resolution for explicit Gradle/Maven coordinates.

Implemented behavior:

- Parses coordinates embedded in Gradle method calls such as `modImplementation "group:artifact:version"`.
- Builds deterministic binary jar and optional `-sources.jar` candidates from Maven repository layout.
- Reads `maven-metadata.xml` when a coordinate omits the version.
- Emits generic `maven-repository` dispatch metadata with method-level Gradle usage.
- MCP `external_mod_resolution` now detects explicit Maven coordinates before Modrinth or CurseForge search.
- No remote jar download is performed.

## Red Phase
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/maven-repository.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts
```

Expected failures before implementation:

```text
FAIL packages/external-mod-resolver/src/maven-repository.test.ts
Error: Cannot find module './maven-repository.js'

FAIL apps/mcp-server/src/external-mod-resolution-executor.test.ts
expected platform "maven"
received platform "modrinth"
summary: "External mod resolution needs mod loader."
```

## Green Phase
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/maven-repository.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/maven-repository.test.ts (2 tests)
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (3 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (2 tests)

Test Files  3 passed (3)
Tests  7 passed (7)
```

## Actual Resolver Values
Command:

```bash
pnpm exec tsx -e '... resolveMavenArtifact exact coordinate and metadata coordinate ...'
```

Observed exact coordinate output:

```json
{
  "source": "maven",
  "query": "com.example:demo-mod:1.2.3",
  "candidates": [
    {
      "fileName": "demo-mod-1.2.3.jar",
      "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar",
      "coordinates": "com.example:demo-mod:1.2.3",
      "modImplementation": "modImplementation \"com.example:demo-mod:1.2.3\""
    },
    {
      "fileName": "demo-mod-1.2.3-sources.jar",
      "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3-sources.jar",
      "coordinates": "com.example:demo-mod:1.2.3"
    }
  ],
  "warnings": []
}
```

Observed metadata output:

```json
{
  "source": "maven",
  "query": "com.example:demo-mod:1.2.4",
  "candidates": [
    {
      "versionId": "1.2.4",
      "fileName": "demo-mod-1.2.4.jar",
      "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4.jar",
      "confidenceReasons": [
        "resolved Maven version 1.2.4 from maven-metadata.xml",
        "selected repository Example Maven",
        "built deterministic Maven artifact URL"
      ]
    }
  ],
  "warnings": []
}
```

## Actual MCP Values
Command:

```bash
pnpm exec tsx <<'TS'
import { buildMcpServerBootstrap } from "./apps/mcp-server/src/bootstrap.ts";
import { executeMcpServerRequest } from "./apps/mcp-server/src/request-executor.ts";

const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: "/tmp/mcpskill-runtime" });
const result = await executeMcpServerRequest({
  bootstrap,
  requestText: 'Use modImplementation "com.example:demo-mod:1.2.3" from https://maven.example/releases.'
});
console.log(JSON.stringify(result.selectedEvidence, null, 2));
TS
```

Observed compact shape:

```json
{
  "candidateId": "candidate-1-external_mod_resolution",
  "routeStep": "external_mod_resolution",
  "preferredTool": "context.query",
  "status": "selected",
  "summary": "Resolved external mod Maven coordinates: com.example:demo-mod:1.2.3.",
  "payload": {
    "request": {
      "platform": "maven",
      "coordinate": "com.example:demo-mod:1.2.3",
      "repositoryUrls": ["https://maven.example/releases"]
    },
    "result": {
      "source": "maven",
      "candidates": [
        {
          "fileName": "demo-mod-1.2.3.jar",
          "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar"
        },
        {
          "fileName": "demo-mod-1.2.3-sources.jar",
          "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3-sources.jar"
        }
      ]
    }
  }
}
```

## Residual Risks
- This slice uses the first configured/requested repository. Repository ranking across Gradle-derived repositories remains a future orchestrator step.
- Metadata lookup is fixture-tested. Real repository smoke can be added when a stable external Maven target is selected.
- Maven candidates are metadata-only and do not prove the jar exists unless metadata or a later HEAD/download policy verifies it.
