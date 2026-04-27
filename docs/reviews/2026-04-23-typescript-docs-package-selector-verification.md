# TypeScript Docs Package Selector Verification
Date: 2026-04-23
Author: m1hono
Status: PASS

## Scope
- add the first TypeScript docs-package foundation for version-scoped offline docs
- introduce shared docs manifest types, a generic package registry, and a minimal docs selector
- encode `CrychicDoc KubeJS 1.20.1` as the first builtin docs package without widening the MCP public API

## Files
- `packages/shared-types/src/docs.ts`
- `packages/shared-types/src/index.ts`
- `packages/package-registry/src/registry.ts`
- `packages/package-registry/src/registry.test.ts`
- `packages/package-registry/src/index.ts`
- `packages/package-registry/package.json`
- `packages/docs-retrieval/src/builtin-packages.ts`
- `packages/docs-retrieval/src/selector.ts`
- `packages/docs-retrieval/src/selector.test.ts`
- `packages/docs-retrieval/src/index.ts`
- `packages/docs-retrieval/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/package-registry/src/registry.test.ts
pnpm exec vitest run packages/docs-retrieval/src/selector.test.ts
pnpm install --offline
pnpm exec tsc -b packages/shared-types packages/package-registry packages/docs-retrieval
pnpm --filter @mcpskill/package-registry test
pnpm --filter @mcpskill/docs-retrieval test
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { selectDocsPackages } from './packages/docs-retrieval/src/index.ts'; const makePlan = ({ requestText, taskIntentId, workspaceKind, runtimeVersion, hasKubeJS, hasProbeJS }) => ({ appId: 'mcp-server', requestText, requestContext: { appId: 'mcp-server', requestText, workspaceContext: { workspaceRoot: '/tmp/workspace', detectorPackage: '@mcpskill/workspace-detector', descriptor: { root: '/tmp/workspace', kind: workspaceKind, hasGradle: true, hasKubeJS, hasProbeJS, hasJavaSource: workspaceKind === 'java-mod', hasDatapack: false, buildFiles: ['/tmp/workspace/build.gradle'], javaSourceRoots: workspaceKind === 'java-mod' ? ['/tmp/workspace/src/main/java'] : [], datapackRoots: [], logPaths: [], reasons: [], currentRuntime: { minecraftVersion: runtimeVersion, source: 'workspace-detect', confidence: 'high', evidenceSources: ['build.gradle'], candidates: [], evidence: [] } } }, harnessSnapshot: { workspaceRoot: '/tmp/workspace', workspaceKind, detectorReasons: [], currentRuntime: { minecraftVersion: runtimeVersion, source: 'workspace-detect', confidence: 'high', evidenceSources: ['build.gradle'], candidates: [], evidence: [] }, routePlan: { scenario: workspaceKind === 'java-mod' ? 'java-mod-workspace' : 'modpack-workspace', reasons: [], defaultRoutingScenario: 'project_symbol', steps: ['workspace_source', 'docs_lookup'] }, facts: { hasGradle: true, hasJavaSource: workspaceKind === 'java-mod', hasKubeJS, hasProbeJS, hasDatapack: false, buildFileCount: 1, javaSourceRootCount: workspaceKind === 'java-mod' ? 1 : 0, datapackRootCount: 0, logPathCount: 0 } }, harnessBrief: { snapshot: {}, availableTools: ['workspace.analyze', 'source.bundle', 'context.query', 'migration.analyze'], preferredTools: ['context.query'], promptFragments: [] }, taskBrief: { snapshot: {}, intent: { id: taskIntentId, confidence: 'high', reasons: [] }, taskRoute: { intent: { id: taskIntentId, confidence: 'high', reasons: [] }, reasons: [], steps: taskIntentId === 'kubejs_authoring' ? ['probejs_types', 'docs_lookup'] : ['log_files', 'workspace_source', 'docs_lookup'], preferredTools: ['context.query'] }, availableTools: ['workspace.analyze', 'source.bundle', 'context.query', 'migration.analyze'], preferredTools: ['context.query'], promptFragments: [] } }, prompt: { sections: [], text: requestText }, toolGuidance: { availableTools: ['workspace.analyze', 'source.bundle', 'context.query', 'migration.analyze'], preferredTools: ['context.query'], routeSteps: taskIntentId === 'kubejs_authoring' ? ['probejs_types', 'docs_lookup'] : ['log_files', 'workspace_source', 'docs_lookup'] }, trace: { workspaceKind, defaultRouteScenario: 'project_symbol', defaultRouteSteps: ['workspace_source', 'docs_lookup'], taskIntent: { id: taskIntentId, confidence: 'high', reasons: [] }, taskRouteReasons: [], taskRouteSteps: taskIntentId === 'kubejs_authoring' ? ['probejs_types', 'docs_lookup'] : ['log_files', 'workspace_source', 'docs_lookup'], selectedPromptFragmentIds: [] } }); const result = selectDocsPackages({ requestPlan: makePlan({ requestText: 'How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?', taskIntentId: 'kubejs_authoring', workspaceKind: 'modpack', runtimeVersion: '1.20.1', hasKubeJS: true, hasProbeJS: true }), routeStep: 'docs_lookup' }); console.log(JSON.stringify(result, null, 2));"
./node_modules/.bin/tsx -e "import { selectDocsPackages } from './packages/docs-retrieval/src/index.ts'; const makePlan = ({ requestText, taskIntentId, workspaceKind, runtimeVersion, hasKubeJS, hasProbeJS }) => ({ appId: 'mcp-server', requestText, requestContext: { appId: 'mcp-server', requestText, workspaceContext: { workspaceRoot: '/tmp/workspace', detectorPackage: '@mcpskill/workspace-detector', descriptor: { root: '/tmp/workspace', kind: workspaceKind, hasGradle: true, hasKubeJS, hasProbeJS, hasJavaSource: workspaceKind === 'java-mod', hasDatapack: false, buildFiles: ['/tmp/workspace/build.gradle'], javaSourceRoots: workspaceKind === 'java-mod' ? ['/tmp/workspace/src/main/java'] : [], datapackRoots: [], logPaths: [], reasons: [], currentRuntime: { minecraftVersion: runtimeVersion, source: 'workspace-detect', confidence: 'high', evidenceSources: ['build.gradle'], candidates: [], evidence: [] } } }, harnessSnapshot: { workspaceRoot: '/tmp/workspace', workspaceKind, detectorReasons: [], currentRuntime: { minecraftVersion: runtimeVersion, source: 'workspace-detect', confidence: 'high', evidenceSources: ['build.gradle'], candidates: [], evidence: [] }, routePlan: { scenario: workspaceKind === 'java-mod' ? 'java-mod-workspace' : 'modpack-workspace', reasons: [], defaultRoutingScenario: 'project_symbol', steps: ['workspace_source', 'docs_lookup'] }, facts: { hasGradle: true, hasJavaSource: workspaceKind === 'java-mod', hasKubeJS, hasProbeJS, hasDatapack: false, buildFileCount: 1, javaSourceRootCount: workspaceKind === 'java-mod' ? 1 : 0, datapackRootCount: 0, logPathCount: 0 } }, harnessBrief: { snapshot: {}, availableTools: ['workspace.analyze', 'source.bundle', 'context.query', 'migration.analyze'], preferredTools: ['context.query'], promptFragments: [] }, taskBrief: { snapshot: {}, intent: { id: taskIntentId, confidence: 'high', reasons: [] }, taskRoute: { intent: { id: taskIntentId, confidence: 'high', reasons: [] }, reasons: [], steps: taskIntentId === 'kubejs_authoring' ? ['probejs_types', 'docs_lookup'] : ['log_files', 'workspace_source', 'docs_lookup'], preferredTools: ['context.query'] }, availableTools: ['workspace.analyze', 'source.bundle', 'context.query', 'migration.analyze'], preferredTools: ['context.query'], promptFragments: [] } }, prompt: { sections: [], text: requestText }, toolGuidance: { availableTools: ['workspace.analyze', 'source.bundle', 'context.query', 'migration.analyze'], preferredTools: ['context.query'], routeSteps: taskIntentId === 'kubejs_authoring' ? ['probejs_types', 'docs_lookup'] : ['log_files', 'workspace_source', 'docs_lookup'] }, trace: { workspaceKind, defaultRouteScenario: 'project_symbol', defaultRouteSteps: ['workspace_source', 'docs_lookup'], taskIntent: { id: taskIntentId, confidence: 'high', reasons: [] }, taskRouteReasons: [], taskRouteSteps: taskIntentId === 'kubejs_authoring' ? ['probejs_types', 'docs_lookup'] : ['log_files', 'workspace_source', 'docs_lookup'], selectedPromptFragmentIds: [] } }); const result = selectDocsPackages({ requestPlan: makePlan({ requestText: 'How do I use ProbeJS in this KubeJS pack?', taskIntentId: 'kubejs_authoring', workspaceKind: 'modpack', runtimeVersion: '1.21', hasKubeJS: true, hasProbeJS: true }), routeStep: 'docs_lookup' }); console.log(JSON.stringify(result, null, 2));"
```

## Command Results

### RED: package-registry test before implementation
- Command: `pnpm exec vitest run packages/package-registry/src/registry.test.ts`
- Initial exit code: `1`

```text
FAIL  packages/package-registry/src/registry.test.ts
Error: Cannot find module './registry.js'
```

### RED: docs selector test before implementation
- Command: `pnpm exec vitest run packages/docs-retrieval/src/selector.test.ts`
- Initial exit code: `1`

```text
× selectDocsPackages > selects the CrychicDoc KubeJS package for 1.20.1 KubeJS authoring docs lookup
  → selectDocsPackages is not a function
× selectDocsPackages > rejects the CrychicDoc package when the workspace runtime is not 1.20.1
  → selectDocsPackages is not a function
× selectDocsPackages > rejects the CrychicDoc package for non-KubeJS crash triage requests
  → selectDocsPackages is not a function
× selectDocsPackages > returns the builtin registry with the CrychicDoc package manifest
  → buildBuiltinDocsRegistry is not a function
```

### Workspace link refresh
- Command: `pnpm install --offline`
- Exit code: `0`

```text
Scope: all 15 workspace projects
Already up to date
Done in 2.1s using pnpm v10.8.0
```

### Targeted build for the new packages
- Command: `pnpm exec tsc -b packages/shared-types packages/package-registry packages/docs-retrieval`
- Exit code: `0`
- stdout/stderr: empty

### Package-registry package suite
- Command: `pnpm --filter @mcpskill/package-registry test`
- Exit code: `0`

```text
> @mcpskill/package-registry@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/package-registry
> tsc -b . && vitest run --root ../.. packages/package-registry/src/registry.test.ts

✓ packages/package-registry/src/registry.test.ts (2 tests) 2ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  00:43:38
Duration  350ms (transform 70ms, setup 0ms, collect 122ms, tests 2ms, environment 0ms, prepare 60ms)
```

### Docs-retrieval package suite
- Command: `pnpm --filter @mcpskill/docs-retrieval test`
- Exit code: `0`

```text
> @mcpskill/docs-retrieval@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/docs-retrieval
> tsc -b ../shared-types ../package-registry . && vitest run --root ../.. packages/docs-retrieval/src/selector.test.ts

✓ packages/docs-retrieval/src/selector.test.ts (4 tests) 2ms

Test Files  1 passed (1)
     Tests  4 passed (4)
Start at  00:43:38
Duration  270ms (transform 34ms, setup 0ms, collect 38ms, tests 2ms, environment 0ms, prepare 55ms)
```

### Root TypeScript build
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
✓ packages/docs-retrieval/src/selector.test.ts (4 tests) 3ms
✓ packages/package-registry/src/registry.test.ts (2 tests) 2ms
✓ apps/mcp-server/src/request-handler.test.ts (2 tests) 21ms

Test Files  22 passed (22)
     Tests  71 passed (71)
Start at  00:44:11
Duration  1.01s (transform 1.63s, setup 0ms, collect 4.22s, tests 205ms, environment 5ms, prepare 2.37s)
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`

## Direct Runtime Samples

### 1.20.1 KubeJS authoring query selects CrychicDoc
- Exit code: `0`

```json
{
  "selections": [
    {
      "packageId": "crychicdoc-kubejs-1.20.1-course-zh-cn",
      "score": 15,
      "reasons": [
        "task intent is kubejs_authoring",
        "workspace runtime matches Minecraft 1.20.1",
        "route step is docs_lookup",
        "workspace exposes KubeJS or ProbeJS signals",
        "query matches package signals: probejs, startup_scripts, recipe"
      ],
      "matchedSignals": [
        "probejs",
        "startup_scripts",
        "recipe"
      ]
    }
  ],
  "trace": {
    "registryPackageIds": [
      "crychicdoc-kubejs-1.20.1-course-zh-cn"
    ],
    "requestRuntimeVersion": "1.20.1",
    "taskIntentId": "kubejs_authoring",
    "routeStep": "docs_lookup",
    "rejectedPackages": []
  }
}
```

### 1.21 KubeJS authoring query is rejected by the version fence
- Exit code: `0`

```json
{
  "selections": [],
  "trace": {
    "registryPackageIds": [
      "crychicdoc-kubejs-1.20.1-course-zh-cn"
    ],
    "requestRuntimeVersion": "1.21",
    "taskIntentId": "kubejs_authoring",
    "routeStep": "docs_lookup",
    "rejectedPackages": [
      {
        "packageId": "crychicdoc-kubejs-1.20.1-course-zh-cn",
        "reason": "workspace runtime 1.21 is outside the package version fence"
      }
    ]
  }
}
```

## Notes

- The selector currently operates at package level only. It does not retrieve page-level snippets yet.
- This slice keeps the public MCP app surface unchanged and prepares the next step: plugging docs package selection into a real docs executor.
