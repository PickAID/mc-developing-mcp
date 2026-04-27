# TypeScript MCP Server Docs Selection Execution Verification
Date: 2026-04-23
Author: m1hono
Status: PASS

## Scope
- wire docs package selection into the internal `mcp-server` execution flow
- keep the public API minimal and unchanged
- verify that `docs_lookup` candidates carry package-selection trace into execution results
- verify that `CrychicDoc KubeJS 1.20.1` is selected only when the request stays inside its intent and version fence
- verify that failed docs lookups do not pollute `selectedDocsPackageIds`
- verify that failed executions retain the exact `docsSelection` object that was passed into the executor

## Files
- `apps/mcp-server/src/docs-selection.ts`
- `apps/mcp-server/src/docs-selection.test.ts`
- `apps/mcp-server/src/request-handler.ts`
- `apps/mcp-server/src/request-handler.test.ts`
- `apps/mcp-server/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/mcp-server/src/docs-selection.test.ts
pnpm exec vitest run apps/mcp-server/src/request-handler.test.ts
pnpm --filter @mcpskill/mcp-server test
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "<sample: bootstrap + request-plan + docs-selection for modpack_kubejs and modpack_external_crash>"
./node_modules/.bin/tsx -e "<sample: evidence-plan + request-handler for modpack_kubejs>"
```

## Command Results

### Observed failure before the final test fix
- Command: `pnpm exec vitest run apps/mcp-server/src/docs-selection.test.ts`
- Initial exit code: `1`

```text
 FAIL  apps/mcp-server/src/docs-selection.test.ts
 AssertionError: expected { selections: [ ... ], trace: { ... } } to match object {
   trace: { requestRuntimeVersion: '1.20.1', ... }
 }

 - Expected
 + Received

 - requestRuntimeVersion: "1.20.1"
 + requestRuntimeVersion: undefined
```

Reason:
- the selector only fills `trace.requestRuntimeVersion` from workspace detection
- these scenario-backed request plans still select the correct package from strict version text and query signals
- the fix was to relax the test, not to invent a new runtime backfill rule

### Targeted docs-selection test
- Command: `pnpm exec vitest run apps/mcp-server/src/docs-selection.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/docs-selection.test.ts (2 tests) 5ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Duration  744ms
```

### Targeted request-handler test
- Command: `pnpm exec vitest run apps/mcp-server/src/request-handler.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/request-handler.test.ts (4 tests) 6ms

Test Files  1 passed (1)
     Tests  4 passed (4)
Duration  360ms
```

### RED: handler trace regression exposed by the follow-up review
- Command: `pnpm exec vitest run apps/mcp-server/src/request-handler.test.ts`
- Initial exit code: `1`

```text
× executeMcpServerRequestHandler > does not mark docs packages as selected when docs lookup fails after selection
  → expected { selections: [ { …(5) } ], …(1) } to be { selections: [ { …(5) } ], …(1) } // Object.is equality

Expected: { selections: [ { …(5) } ], …(1) }
Received: serializes to the same string
```

Root cause:
- `catch` rebuilt `docsSelection` instead of reusing the exact object given to the executor
- `selectedDocsPackageIds` was aggregated from every execution that carried docs selection, even failed ones

Fix:
- compute `docsSelection` once per candidate and reuse it in the success, skip, and failure paths
- derive `selectedDocsPackageIds` only from `selectedEvidence.docsSelection`

### Sandbox note for package-level verification
- First in-sandbox run of `pnpm --filter @mcpskill/mcp-server test` failed with `EPERM`
- Failure mode: TypeScript could not write `apps/mcp-server/dist/*` and `apps/mcp-server/tsconfig.tsbuildinfo`
- The same command passed when rerun outside the sandbox for real verification

```text
error TS5033: Could not write file '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server/dist/docs-selection.d.ts': EPERM
error TS5033: Could not write file '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server/dist/request-handler.js': EPERM
error TS5033: Could not write file '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server/tsconfig.tsbuildinfo': EPERM
```

### MCP server package suite
- Command: `pnpm --filter @mcpskill/mcp-server test`
- Exit code: `0`

```text
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 9ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 5ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 9ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 8ms
✓ apps/mcp-server/src/docs-selection.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-handler.test.ts (4 tests) 10ms

Test Files  7 passed (7)
     Tests  15 passed (15)
Duration  367ms
```

### Root TypeScript build
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/docs-retrieval/src/selector.test.ts (4 tests) 3ms
✓ apps/mcp-server/src/docs-selection.test.ts (2 tests) 15ms
✓ apps/mcp-server/src/request-handler.test.ts (4 tests) 31ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 2ms

Test Files  23 passed (23)
     Tests  75 passed (75)
Duration  810ms
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: checked entries returned `OK`

## Direct Runtime Samples

### `buildMcpServerDocsSelection` on KubeJS docs lookup
- Scenario: `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "selections": [
    {
      "packageId": "crychicdoc-kubejs-1.20.1-course-zh-cn",
      "score": 14,
      "matchedSignals": ["probejs", "startup_scripts", "recipe"],
      "reasons": [
        "task intent is kubejs_authoring",
        "request text matches strict Minecraft 1.20.1 fence",
        "route step is docs_lookup",
        "workspace exposes KubeJS or ProbeJS signals",
        "query matches package signals: probejs, startup_scripts, recipe"
      ]
    }
  ],
  "trace": {
    "registryPackageIds": ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
    "taskIntentId": "kubejs_authoring",
    "routeStep": "docs_lookup",
    "rejectedPackages": []
  }
}
```

### `buildMcpServerDocsSelection` on crash triage
- Scenario: `testdata/scenarios/modpack_external_crash`
- Exit code: `0`

```json
{
  "selections": [],
  "trace": {
    "registryPackageIds": ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
    "taskIntentId": "crash_triage",
    "routeStep": "docs_lookup",
    "rejectedPackages": [
      {
        "packageId": "crychicdoc-kubejs-1.20.1-course-zh-cn",
        "reason": "task intent crash_triage is outside the package intent scope"
      }
    ]
  }
}
```

### `executeMcpServerRequestHandler` attaches docs selection to execution trace
- Scenario: `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-2-docs_lookup",
    "status": "fallback",
    "summary": "Resolved from the versioned CrychicDoc package.",
    "payload": {
      "packageIds": ["crychicdoc-kubejs-1.20.1-course-zh-cn"]
    }
  },
  "trace": {
    "routeSteps": ["probejs_types", "docs_lookup"],
    "candidateIds": ["candidate-1-probejs_types", "candidate-2-docs_lookup"],
    "executedCandidateIds": ["candidate-1-probejs_types", "candidate-2-docs_lookup"],
    "failedCandidateIds": [],
    "skippedCandidateIds": ["candidate-1-probejs_types"],
    "docsSelectionCandidateIds": ["candidate-2-docs_lookup"],
    "selectedDocsPackageIds": ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
    "selectedCandidateId": "candidate-2-docs_lookup",
    "fallbackUsed": true
  }
}
```

### `executeMcpServerRequestHandler` keeps failed docs lookup trace honest
- Scenario: `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "trace": {
    "routeSteps": ["probejs_types", "docs_lookup"],
    "candidateIds": ["candidate-1-probejs_types", "candidate-2-docs_lookup"],
    "executedCandidateIds": ["candidate-1-probejs_types", "candidate-2-docs_lookup"],
    "failedCandidateIds": ["candidate-2-docs_lookup"],
    "skippedCandidateIds": ["candidate-1-probejs_types"],
    "docsSelectionCandidateIds": ["candidate-2-docs_lookup"],
    "selectedDocsPackageIds": [],
    "fallbackUsed": false
  },
  "failedDocsSelectionReused": true,
  "docsLookupExecution": {
    "candidateId": "candidate-2-docs_lookup",
    "status": "failed",
    "summary": "Executor failed for context.query.",
    "error": "docs lookup backend failed"
  }
}
```

## Notes
- This slice keeps package selection internal to `mcp-server`; no public API widening was introduced.
- `requestRuntimeVersion` stays optional. This patch does not synthesize runtime trace from request text.
- A follow-up review still noted that `skippedCandidateIds` mixes unmatched and bypassed candidates. That is a low-severity trace-model issue and remains for a later trace-shape cleanup.
- The next slice should plug the selected package ids into a real docs executor and page-level retrieval path.
