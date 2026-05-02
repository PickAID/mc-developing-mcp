# External Mod Metadata Cache Verification
Date: 2026-05-03
Author: m1hono
Scope: `@mcpskill/external-mod-resolver`, `@mcpskill/mcp-server`

## Summary
Added runtime-local Maven metadata caching for external mod resolution.

Implemented behavior:

- Added memory and file-backed Maven metadata cache adapters.
- File cache stores metadata under `<runtimeRoot>/external-mod-resolver/metadata/maven`.
- `resolveMavenArtifact` checks the metadata cache before fetching `maven-metadata.xml`.
- Cache traces expose `hits`, `misses`, and `writes` without dumping raw metadata into summaries.
- MCP default `external_mod_resolution` now uses a file cache derived from `runtimeRoot`.
- Omitted-version Maven coordinates can resolve offline when metadata was cached earlier.

## Red Phase
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/metadata-cache.test.ts packages/external-mod-resolver/src/maven-repository.test.ts
```

Expected failure before implementation:

```text
FAIL packages/external-mod-resolver/src/metadata-cache.test.ts
Error: Cannot find module './metadata-cache.js'

FAIL packages/external-mod-resolver/src/maven-repository.test.ts
Error: Cannot find module './metadata-cache.js'
```

MCP integration red phase:

```text
FAIL apps/mcp-server/src/request-executor-external-mod.test.ts
expected platform "maven"
received platform "modrinth"
```

## Green Phase
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/request-executor-external-mod.test.ts packages/external-mod-resolver/src/metadata-cache.test.ts packages/external-mod-resolver/src/maven-repository.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/metadata-cache.test.ts (1 test)
✓ packages/external-mod-resolver/src/maven-repository.test.ts (3 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (3 tests)

Test Files  3 passed (3)
Tests  7 passed (7)
```

## Actual Resolver Values
Command:

```bash
pnpm exec tsx <<'TS'
import { createMemoryMavenMetadataCache, resolveMavenArtifact } from "./packages/external-mod-resolver/src/index.ts";
// Resolve com.example:demo-mod twice with the same metadata cache.
TS
```

Observed compact result:

```json
{
  "fetchCount": 1,
  "first": {
    "hits": [],
    "misses": [
      "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
    ],
    "writes": [
      "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
    ]
  },
  "second": {
    "hits": [
      "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
    ],
    "misses": [],
    "writes": []
  },
  "secondQuery": "com.example:demo-mod:1.2.4"
}
```

## Actual MCP Values
Command:

```bash
pnpm exec tsx <<'TS'
import { createFileMavenMetadataCache } from "./packages/external-mod-resolver/src/index.ts";
import { buildMcpServerBootstrap } from "./apps/mcp-server/src/bootstrap.ts";
import { executeMcpServerRequest } from "./apps/mcp-server/src/request-executor.ts";
// Preload runtimeRoot Maven metadata, then request com.example:demo-mod without a version.
TS
```

Observed compact result:

```json
{
  "summary": "Resolved external mod Maven coordinates: com.example:demo-mod:1.2.4.",
  "request": {
    "platform": "maven",
    "coordinate": "com.example:demo-mod",
    "repositoryUrls": ["https://maven.example/releases"]
  },
  "result": {
    "source": "maven",
    "query": "com.example:demo-mod:1.2.4",
    "cacheTrace": {
      "hits": [
        "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
      ],
      "misses": [],
      "writes": []
    },
    "candidates": [
      {
        "fileName": "demo-mod-1.2.4.jar",
        "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4.jar"
      },
      {
        "fileName": "demo-mod-1.2.4-sources.jar",
        "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4-sources.jar"
      }
    ]
  }
}
```

## Residual Risks
- This is a file-backed metadata cache, not SQLite yet. The interface is intentionally small so a SQLite adapter can replace it later.
- Cache entries do not yet enforce TTL or stale-cache policy.
- Repository ranking still uses requested/inferred repository order; Gradle-derived repository ranking remains pending.
