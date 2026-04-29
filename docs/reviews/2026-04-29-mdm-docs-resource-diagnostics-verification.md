# MDM Docs Resource Diagnostics Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server`, `@mcpskill/docs-retrieval`

## Result
`mc_develop` now reports a compact `mdmDocs` summary in structured content.

- Valid ready docs artifacts contribute searchable records to `docs_lookup`.
- Invalid ready docs artifacts are reported as `mdmDocs.status="degraded"`.
- Bad docs artifacts do not fail the whole request.
- Error output is bounded to package id, artifact path, and message.
- `docs_lookup` can still use built-in docs when resource docs are degraded.

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Builds a local release manifest whose artifact has a valid checksum but invalid JSON content.
# Calls mc_develop with mdmReleaseInstall.downloadPolicy="allowed".
TS
```

Output:

```json
{
  "toolNames": [
    "mc_develop"
  ],
  "text": {
    "type": "text",
    "text": "Selected: candidate-2-docs_lookup (docs_lookup, context.query)\nRoute: probejs_types -> docs_lookup\nExecuted: candidate-1-probejs_types, candidate-2-docs_lookup\nSummary: Resolved docs lookup with 1 structured docs hits.\nMDM release install: downloaded (core-docs-required)"
  },
  "mdmReleaseInstall": {
    "status": "downloaded",
    "packageId": "core-docs-required",
    "artifactUrl": "file:///var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-sample-release-out-1kq0Vt/core-docs-required-0.1.0.mdm-resource.json",
    "state": {
      "packageId": "core-docs-required",
      "artifactName": "core-docs-required-0.1.0.mdm-resource.json",
      "artifactPath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-sample-runtime-N1isyr/mdm-resources/artifacts/core-docs-required/core-docs-required-0.1.0.mdm-resource.json",
      "sha256": "0228f717792ffbc02f7fa058c934c10d7e91d0de743e365ebd78bfebf019254e",
      "updatedAt": "2026-04-29T06:52:54.201Z"
    },
    "message": "Downloaded and cached MDM release package core-docs-required.",
    "manifestSource": "file:///var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-sample-release-out-1kq0Vt/mdm-release-manifest.json",
    "downloadPolicy": "allowed"
  },
  "mdmResourceCounts": {
    "missing_required": 0,
    "missing_optional": 0,
    "ready": 1,
    "invalid_checksum": 0
  },
  "mdmDocs": {
    "status": "degraded",
    "artifactCount": 1,
    "recordCount": 0,
    "failedArtifactCount": 1,
    "errors": [
      {
        "packageId": "core-docs-required",
        "artifactPath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-sample-runtime-N1isyr/mdm-resources/artifacts/core-docs-required/core-docs-required-0.1.0.mdm-resource.json",
        "message": "Expected property name or '}' in JSON at position 2 (line 1 column 3)"
      }
    ]
  },
  "selectedEvidence": {
    "candidateId": "candidate-2-docs_lookup",
    "routeStep": "docs_lookup",
    "preferredTool": "context.query",
    "status": "fallback",
    "attempted": true,
    "summary": "Resolved docs lookup with 1 structured docs hits.",
    "pathHints": [],
    "queryHint": "In KubeJS 1.20.1, explain ProbeJS.",
    "payload": {
      "source": "docs_lookup",
      "queryText": "In KubeJS 1.20.1, explain ProbeJS.",
      "selectedPackageIds": [
        "crychicdoc-kubejs-1.20.1-course-zh-cn"
      ],
      "hits": [
        {
          "entryId": "crychicdoc-kubejs-1.20.1-probejs-workflow",
          "packageId": "crychicdoc-kubejs-1.20.1-course-zh-cn",
          "kind": "addon-guide",
          "title": "ProbeJS Workflow, Type Generation, and TS Server Recovery",
          "path": "docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/ProbeJS.md",
          "summary": "Covers ProbeJS dump commands, generated type and snippet files, version differences, and when the TypeScript server must be restarted in VS Code.",
          "score": 19,
          "matchedTerms": [
            "probejs"
          ]
        }
      ],
      "trace": {
        "queryText": "In KubeJS 1.20.1, explain ProbeJS.",
        "selectedPackageIds": [
          "crychicdoc-kubejs-1.20.1-course-zh-cn"
        ],
        "candidateEntryIds": [
          "crychicdoc-kubejs-1.20.1-file-structure",
          "crychicdoc-kubejs-1.20.1-probejs-workflow",
          "crychicdoc-kubejs-1.20.1-event-catalog",
          "crychicdoc-kubejs-1.20.1-lootjs-guide"
        ],
        "resourceEntryIds": [],
        "matchedEntryIds": [
          "crychicdoc-kubejs-1.20.1-probejs-workflow"
        ]
      }
    }
  }
}
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mdm-docs-records.test.ts apps/mcp-server/src/mcp-tools-mdm-docs-resources.test.ts apps/mcp-server/src/mcp-tools-mdm-resources.test.ts apps/mcp-server/src/mcp-structured-content.test.ts
```

Output:

```text
 RUN  v3.2.4 /private/tmp/mc-developing-mcp-skill-update

 ✓ apps/mcp-server/src/mcp-structured-content.test.ts (2 tests) 2ms
 ✓ apps/mcp-server/src/mdm-docs-records.test.ts (1 test) 4ms
 ✓ apps/mcp-server/src/mcp-tools-mdm-docs-resources.test.ts (1 test) 11ms
 ✓ apps/mcp-server/src/mcp-tools-mdm-resources.test.ts (5 tests) 24ms

 Test Files  4 passed (4)
      Tests  9 passed (9)
   Start at  16:51:47
   Duration  674ms (transform 245ms, setup 0ms, collect 958ms, tests 49ms, environment 0ms, prepare 158ms)
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

 Test Files  84 passed (84)
      Tests  262 passed (262)
   Start at  16:52:06
   Duration  2.35s (transform 2.83s, setup 0ms, collect 12.15s, tests 5.92s, environment 10ms, prepare 4.27s)
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

Output: no source/test files over 500 lines.

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
