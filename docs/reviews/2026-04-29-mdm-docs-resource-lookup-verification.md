# MDM Docs Resource Lookup Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/docs-retrieval`, `apps/mcp-server`

## Result
`docs_lookup` can now use cached MDM docs resource artifacts as structured docs records.

- `@mcpskill/docs-retrieval` reads `.mdm-resource.json` docs artifacts without markdown.
- Resource docs records are searched alongside selected built-in docs records.
- `mc_develop` loads ready MDM docs artifacts from runtime cache and passes them into `context.query`.
- A same-call install path works: `mdmReleaseInstall.downloadPolicy="allowed"` installs the artifact, refreshes `mdmResources`, loads docs records, then `docs_lookup` can select those records.
- Missing or invalid resource docs remain optional; bad cached docs artifacts are ignored by the loader instead of failing the whole request.

## Real MCP Return Sample
Input used the real local `mdm-sources` release output:

```text
/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources/release-out/mdm-release-manifest.json
```

Command:

```bash
pnpm exec tsx <<'TS'
# Calls mc_develop with mdmReleaseInstall.allowed, MDM_SOURCES_ROOT pointing at mdm-sources,
# and requestText "In KubeJS 1.20.1, explain offline resource status and ProbeJS."
TS
```

Output excerpt:

```json
{
  "toolNames": [
    "mc_develop"
  ],
  "text": {
    "type": "text",
    "text": "Selected: candidate-2-docs_lookup (docs_lookup, context.query)\nRoute: probejs_types -> docs_lookup\nExecuted: candidate-1-probejs_types, candidate-2-docs_lookup\nSummary: Resolved docs lookup with 2 structured docs hits.\nMDM release install: downloaded (core-docs-required)"
  },
  "mdmReleaseInstall": {
    "status": "downloaded",
    "packageId": "core-docs-required",
    "artifactUrl": "file:///Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources/release-out/core-docs-required-0.1.0.mdm-resource.json",
    "state": {
      "packageId": "core-docs-required",
      "artifactName": "core-docs-required-0.1.0.mdm-resource.json",
      "sha256": "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
      "updatedAt": "2026-04-29T00:00:00.000Z"
    },
    "downloadPolicy": "allowed"
  },
  "mdmResourceCounts": {
    "missing_required": 0,
    "missing_optional": 0,
    "ready": 1,
    "invalid_checksum": 0
  },
  "selectedEvidence": {
    "routeStep": "docs_lookup",
    "summary": "Resolved docs lookup with 2 structured docs hits.",
    "hits": [
      {
        "entryId": "crychicdoc-kubejs-1.20.1-probejs-workflow",
        "packageId": "crychicdoc-kubejs-1.20.1-course-zh-cn",
        "title": "ProbeJS Workflow, Type Generation, and TS Server Recovery",
        "score": 19,
        "matchedTerms": [
          "probejs"
        ]
      },
      {
        "entryId": "offline-resource-status",
        "packageId": "core-docs-required",
        "title": "Offline Resource Status",
        "score": 12,
        "matchedTerms": [
          "offline resource status"
        ]
      }
    ],
    "trace": {
      "selectedPackageIds": [
        "crychicdoc-kubejs-1.20.1-course-zh-cn"
      ],
      "resourceEntryIds": [
        "offline-resource-status",
        "private-derived-cache-policy"
      ],
      "matchedEntryIds": [
        "crychicdoc-kubejs-1.20.1-probejs-workflow",
        "offline-resource-status"
      ]
    }
  }
}
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-tools-mdm-resources.test.ts packages/docs-retrieval/src/mdm-resource.test.ts packages/docs-retrieval/src/search.test.ts apps/mcp-server/src/docs-lookup-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /private/tmp/mc-developing-mcp-skill-update

 ✓ packages/docs-retrieval/src/mdm-resource.test.ts (2 tests) 3ms
 ✓ packages/docs-retrieval/src/search.test.ts (2 tests) 7ms
 ✓ apps/mcp-server/src/docs-lookup-executor.test.ts (2 tests) 9ms
 ✓ apps/mcp-server/src/mcp-tools-mdm-resources.test.ts (5 tests) 26ms

 Test Files  4 passed (4)
      Tests  11 passed (11)
   Start at  16:34:48
   Duration  611ms (transform 258ms, setup 0ms, collect 595ms, tests 45ms, environment 0ms, prepare 248ms)
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

 Test Files  82 passed (82)
      Tests  260 passed (260)
   Start at  16:35:15
   Duration  2.25s (transform 2.75s, setup 0ms, collect 12.04s, tests 5.49s, environment 7ms, prepare 3.89s)
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
