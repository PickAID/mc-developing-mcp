# MDM Artifact Installer Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/resource-registry`

## Result
This slice adds an explicit-permission artifact installer for MDM Release packages.

- Default behavior is `needs_confirmation`; it does not fetch remote artifacts.
- `downloadPolicy: "allowed"` downloads through an injected/default fetcher.
- Downloaded artifacts are verified with SHA-256 before cache state is written.
- A valid existing cache returns `ready` without another fetch.
- The installer is exported from `packages/resource-registry/src/index.ts`.

This is still not wired into the public `mc_develop` route. Remote resource downloading remains opt-in at the service layer.

## Real Installer Output
Command:

```bash
pnpm exec tsx <<'TS'
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMdmResourceCacheLayout, readCachedResourceState } from "./packages/resource-registry/src/cache.ts";
import { ensureMdmReleasePackageCached } from "./packages/resource-registry/src/installer.ts";

const body = JSON.stringify({ sample: "mdm resource artifact" });
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const manifest = {
  source: "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json",
  schemaVersion: 1,
  generatedAt: "2026-04-29T01:05:10.846Z",
  packages: [{
    packageId: "core-docs-required",
    version: "0.1.0",
    namespace: "core",
    artifactType: "docs",
    variant: "required",
    required: true,
    format: "json",
    artifactName: "core-docs-required-0.1.0.mdm-resource.json",
    sha256: sha256(body),
    sizeBytes: Buffer.byteLength(body)
  }]
} as const;

const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-real-output-"));
const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
let fetchCalls = 0;

const needsConfirmation = await ensureMdmReleasePackageCached({
  manifest,
  packageId: "core-docs-required",
  cacheLayout,
  fetcher: async () => {
    fetchCalls += 1;
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(body) };
  }
});

const downloaded = await ensureMdmReleasePackageCached({
  manifest,
  packageId: "core-docs-required",
  cacheLayout,
  downloadPolicy: "allowed",
  now: () => "2026-04-29T00:00:00.000Z",
  fetcher: async () => {
    fetchCalls += 1;
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(body) };
  }
});

const cached = await ensureMdmReleasePackageCached({
  manifest,
  packageId: "core-docs-required",
  cacheLayout
});

const state = await readCachedResourceState(cacheLayout, "core-docs-required");
const artifact = state ? await readFile(state.artifactPath, "utf-8") : undefined;

console.log(JSON.stringify({
  runtimeRoot,
  fetchCalls,
  needsConfirmation,
  downloaded,
  cached,
  cachedArtifactContent: artifact
}, null, 2));
TS
```

Output:

```json
{
  "runtimeRoot": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-real-output-py15mx",
  "fetchCalls": 1,
  "needsConfirmation": {
    "status": "needs_confirmation",
    "packageId": "core-docs-required",
    "artifactUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/core-docs-required-0.1.0.mdm-resource.json",
    "expectedSha256": "41043961bc77691f21e60240b6668ec9b0800b2139e41c29881b992afe31cd43",
    "message": "MDM release package core-docs-required requires explicit confirmation before download."
  },
  "downloaded": {
    "status": "downloaded",
    "packageId": "core-docs-required",
    "artifactUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/core-docs-required-0.1.0.mdm-resource.json",
    "state": {
      "packageId": "core-docs-required",
      "artifactName": "core-docs-required-0.1.0.mdm-resource.json",
      "artifactPath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-real-output-py15mx/mdm-resources/artifacts/core-docs-required/core-docs-required-0.1.0.mdm-resource.json",
      "sha256": "41043961bc77691f21e60240b6668ec9b0800b2139e41c29881b992afe31cd43",
      "updatedAt": "2026-04-29T00:00:00.000Z"
    },
    "message": "Downloaded and cached MDM release package core-docs-required."
  },
  "cached": {
    "status": "ready",
    "packageId": "core-docs-required",
    "state": {
      "packageId": "core-docs-required",
      "artifactName": "core-docs-required-0.1.0.mdm-resource.json",
      "artifactPath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-real-output-py15mx/mdm-resources/artifacts/core-docs-required/core-docs-required-0.1.0.mdm-resource.json",
      "sha256": "41043961bc77691f21e60240b6668ec9b0800b2139e41c29881b992afe31cd43",
      "updatedAt": "2026-04-29T00:00:00.000Z"
    },
    "message": "MDM release package core-docs-required is already cached."
  },
  "cachedArtifactContent": "{\"sample\":\"mdm resource artifact\"}"
}
```

`fetchCalls: 1` confirms the first call did not fetch because it needed confirmation, the second call downloaded, and the third call reused cache.

## Test Output
Command:

```bash
pnpm --filter @mcpskill/resource-registry test
```

Output:

```text
> @mcpskill/resource-registry@ test /private/tmp/mc-developing-mcp-skill-update/packages/resource-registry
> tsc -b . && vitest run --root ../.. "$PWD/src"/*.test.ts


 RUN  v3.2.4 /private/tmp/mc-developing-mcp-skill-update

 ✓ packages/resource-registry/src/cache.test.ts (3 tests) 4ms
 ✓ packages/resource-registry/src/release-manifest.test.ts (4 tests) 4ms
 ✓ packages/resource-registry/src/local-registry.test.ts (2 tests) 8ms
 ✓ packages/resource-registry/src/installer.test.ts (3 tests) 8ms
 ✓ packages/resource-registry/src/status.test.ts (3 tests) 9ms

 Test Files  5 passed (5)
      Tests  15 passed (15)
   Start at  15:55:45
   Duration  234ms (transform 78ms, setup 0ms, collect 143ms, tests 33ms, environment 0ms, prepare 270ms)
```

## Workspace Test
Command:

```bash
pnpm test
```

Output summary:

```text
> @mcpskill/workspace@ test /private/tmp/mc-developing-mcp-skill-update
> tsc -b && vitest run

 RUN  v3.2.4 /private/tmp/mc-developing-mcp-skill-update

 ✓ packages/workspace-detector/src/detect.test.ts (10 tests) 46ms
 ✓ packages/kubejs-types-adapter/src/summary-filter.test.ts (2 tests) 27ms
 ✓ packages/kubejs-types-adapter/src/discovery.test.ts (5 tests) 37ms
 ✓ apps/mcp-server/src/gradle-source-archive-lookup.test.ts (5 tests) 41ms
 ✓ packages/kubejs-types-adapter/src/summary.test.ts (8 tests) 57ms
 ✓ packages/service-profile/src/profile.test.ts (1 test) 60ms
 ✓ packages/gradle-adapter/src/source-archives.test.ts (2 tests) 52ms
 ✓ apps/mcp-server/src/request-handler.test.ts (5 tests) 61ms
 ✓ packages/source-package-manager/src/install.test.ts (6 tests) 227ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (4 tests) 91ms
 ✓ apps/mcp-server/src/service-profile-context.test.ts (1 test) 13ms
 ✓ apps/mcp-server/src/source-bundle-workspace-executor.test.ts (3 tests) 115ms
 ✓ packages/vanilla-source-adapter/src/resolve.test.ts (6 tests) 108ms
 ✓ packages/datapack-adapter/src/index.test.ts (6 tests) 175ms
 ✓ apps/mcp-server/src/request-executor.test.ts (4 tests) 57ms
 ✓ apps/mcp-server/src/source-bundle-executor.test.ts (5 tests) 165ms
 ✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 37ms
 ✓ apps/mcp-server/src/mcp-tools.test.ts (4 tests) 162ms
 ✓ packages/kubejs-language-service/src/probejs-project.test.ts (4 tests) 151ms
 ✓ apps/mcp-server/src/request-context.test.ts (2 tests) 10ms
 ✓ apps/mcp-server/src/mcp-tools-mdm-resources.test.ts (1 test) 47ms
 ✓ apps/mcp-server/src/docs-lookup-executor.test.ts (2 tests) 21ms
 ✓ apps/mcp-server/src/java-diagnostics-runtime.test.ts (2 tests) 80ms
 ✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 57ms
 ✓ apps/mcp-server/src/evidence-plan.test.ts (5 tests) 33ms
 ✓ apps/mcp-server/src/context-query-executor.test.ts (4 tests) 451ms
 ✓ apps/mcp-server/src/docs-selection.test.ts (2 tests) 9ms
 ✓ packages/source-index/src/indexer.test.ts (2 tests) 48ms
 ✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (3 tests) 84ms
 ✓ apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts (1 test) 32ms
 ✓ packages/source-package-manager/src/executor.test.ts (2 tests) 32ms
 ✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (1 test) 18ms
 ✓ apps/mcp-server/src/mdm-resource-status.test.ts (2 tests) 54ms
 ✓ packages/kubejs-language-service/src/language-service.test.ts (4 tests) 982ms
 ✓ packages/jar-source-adapter/src/class-owner.test.ts (2 tests) 7ms
 ✓ packages/gradle-adapter/src/build-dependencies.test.ts (3 tests) 16ms
 ✓ apps/mcp-server/src/stdio-subprocess.test.ts (1 test) 604ms
 ✓ packages/java-jdtls-adapter/src/process-session.test.ts (3 tests) 8ms
 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 31ms
 ✓ packages/java-jdtls-adapter/src/jdtls-session.test.ts (1 test) 3ms
 ✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 22ms
 ✓ apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts (1 test) 16ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (2 tests) 17ms
 ✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 22ms
 ✓ packages/java-jdtls-adapter/src/jdtls-manager.test.ts (3 tests) 5ms
 ✓ packages/resource-registry/src/installer.test.ts (3 tests) 14ms
 ✓ packages/resource-registry/src/status.test.ts (3 tests) 31ms
 ✓ packages/resource-registry/src/local-registry.test.ts (2 tests) 6ms
 ✓ packages/java-jdtls-adapter/src/restart-policy.test.ts (1 test) 1ms
 ✓ packages/java-jdtls-adapter/src/diagnostic-registry.test.ts (3 tests) 8ms
 ✓ packages/java-jdtls-adapter/src/profile.test.ts (3 tests) 14ms
 ✓ packages/gradle-adapter/src/dependency-source-archives.test.ts (1 test) 15ms
 ✓ packages/docs-retrieval/src/search.test.ts (2 tests) 8ms
 ✓ packages/resource-registry/src/cache.test.ts (3 tests) 12ms
 ✓ packages/source-package-manager/src/confirmation.test.ts (2 tests) 12ms
 ✓ packages/gradle-adapter/src/dependency-binary-archives.test.ts (1 test) 10ms
 ✓ packages/java-jdtls-adapter/src/resilient-jdtls-manager.test.ts (8 tests) 5ms
 ✓ packages/resource-registry/src/release-manifest.test.ts (4 tests) 6ms
 ✓ packages/java-jdtls-adapter/src/json-rpc-client.test.ts (3 tests) 4ms
 ✓ apps/mcp-server/src/package-metadata.test.ts (1 test) 2ms
 ✓ apps/mcp-server/src/mcp-structured-content.test.ts (2 tests) 2ms
 ✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
 ✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
 ✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
 ✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
 ✓ packages/agent-harness/src/intent.test.ts (5 tests) 2ms
 ✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
 ✓ packages/agent-harness/src/task-route.test.ts (9 tests) 2ms
 ✓ packages/kubejs-language-service/src/cache.test.ts (3 tests) 2ms
 ✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
 ✓ packages/docs-retrieval/src/selector.test.ts (4 tests) 3ms
 ✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
 ✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
 ✓ packages/package-registry/src/registry.test.ts (2 tests) 2ms
 ✓ packages/java-jdtls-adapter/src/file-version-tracker.test.ts (2 tests) 2ms
 ✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
 ✓ packages/agent-harness/src/public-api.test.ts (1 test) 1ms
 ✓ packages/kubejs-language-service/src/scope.test.ts (1 test) 2ms
 ✓ apps/mcp-server/src/mcp-server.test.ts (3 tests) 14ms
 ✓ apps/mcp-server/src/probejs-types-executor.test.ts (6 tests) 1774ms
 ✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms

 Test Files  81 passed (81)
      Tests  254 passed (254)
   Start at  15:57:35
   Duration  2.50s (transform 3.18s, setup 0ms, collect 12.99s, tests 6.36s, environment 8ms, prepare 4.41s)
```

## Typecheck
Command:

```bash
pnpm typecheck
```

Output:

```text
> @mcpskill/workspace@ typecheck /private/tmp/mc-developing-mcp-skill-update
> tsc -b --pretty false
```

No TypeScript errors were emitted.

## Guardrails
Command:

```bash
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Output: no files over 500 lines.

Command:

```bash
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output: no Go source/module files found.

Command:

```bash
git diff --check
```

Output: no whitespace errors.
