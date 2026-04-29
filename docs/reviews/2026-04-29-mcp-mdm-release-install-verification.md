# MCP MDM Release Install Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server`, `mc_develop`

## Result
`mc_develop` now supports one optional progressive input for MDM Release artifact caching:

```json
{
  "mdmReleaseInstall": {
    "manifestPath": "/path/to/mdm-release-manifest.json",
    "packageId": "core-docs-required",
    "downloadPolicy": "disabled"
  }
}
```

or:

```json
{
  "mdmReleaseInstall": {
    "manifestUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json",
    "packageId": "core-docs-required",
    "downloadPolicy": "allowed"
  }
}
```

Default behavior remains no download:

- Missing `downloadPolicy` is treated as `disabled`.
- `disabled` returns `needs_confirmation` and does not write cache state.
- `allowed` downloads the artifact, verifies SHA-256, writes runtime cache, and refreshes `mdmResources`.
- `manifestUrl` installs can use injected manifest/artifact fetchers for deterministic tests and harnesses.
- Public MCP surface remains one tool: `mc_develop`.

Because the same tool can now explicitly write cache files and fetch remote artifacts, MCP annotations were corrected to `readOnlyHint=false` and `openWorldHint=true`.

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Script creates a local release manifest, local artifact, local MDM registry,
# then calls mc_develop once without permission and once with downloadPolicy=allowed.
TS
```

Output excerpt:

```json
{
  "toolNames": [
    "mc_develop"
  ],
  "needsConfirmation": {
    "text": {
      "type": "text",
      "text": "Selected: none\nRoute: probejs_types -> docs_lookup\nExecuted: candidate-1-probejs_types, candidate-2-docs_lookup\nMDM release install: needs_confirmation (core-docs-required)"
    },
    "mdmReleaseInstall": {
      "status": "needs_confirmation",
      "packageId": "core-docs-required",
      "artifactUrl": "file:///var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-release-sample-9ip2yg/core-docs-required-0.1.0.mdm-resource.json",
      "expectedSha256": "889bda1277ff8d32d2024bf93a205c49654ddb71f6f9d47f3eb0529f4f96774d",
      "message": "MDM release package core-docs-required requires explicit confirmation before download.",
      "manifestSource": "file:///var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-release-sample-9ip2yg/mdm-release-manifest.json",
      "downloadPolicy": "disabled"
    },
    "mdmResources": {
      "status": "available",
      "summary": {
        "counts": {
          "missing_required": 1,
          "missing_optional": 0,
          "ready": 0,
          "invalid_checksum": 0
        }
      }
    }
  },
  "downloaded": {
    "text": {
      "type": "text",
      "text": "Selected: none\nRoute: probejs_types -> docs_lookup\nExecuted: candidate-1-probejs_types, candidate-2-docs_lookup\nMDM release install: downloaded (core-docs-required)"
    },
    "mdmReleaseInstall": {
      "status": "downloaded",
      "packageId": "core-docs-required",
      "state": {
        "packageId": "core-docs-required",
        "artifactName": "core-docs-required-0.1.0.mdm-resource.json",
        "artifactPath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-mdm-runtime-sample-sYW3cJ/mdm-resources/artifacts/core-docs-required/core-docs-required-0.1.0.mdm-resource.json",
        "sha256": "889bda1277ff8d32d2024bf93a205c49654ddb71f6f9d47f3eb0529f4f96774d",
        "updatedAt": "2026-04-29T06:08:08.922Z"
      },
      "downloadPolicy": "allowed"
    },
    "mdmResources": {
      "status": "available",
      "summary": {
        "counts": {
          "missing_required": 0,
          "missing_optional": 0,
          "ready": 1,
          "invalid_checksum": 0
        }
      }
    },
    "cachedArtifact": "{\"docs\":true}"
  }
}
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-server.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-tools-mdm-resources.test.ts apps/mcp-server/src/mcp-structured-content.test.ts
```

Output:

```text
 RUN  v3.2.4 /private/tmp/mc-developing-mcp-skill-update

 ✓ apps/mcp-server/src/mcp-structured-content.test.ts (2 tests) 2ms
 ✓ apps/mcp-server/src/mcp-server.test.ts (3 tests) 9ms
 ✓ apps/mcp-server/src/mcp-tools-mdm-resources.test.ts (4 tests) 22ms
 ✓ apps/mcp-server/src/mcp-tools.test.ts (4 tests) 28ms

 Test Files  4 passed (4)
      Tests  13 passed (13)
   Start at  16:12:31
   Duration  662ms (transform 291ms, setup 0ms, collect 1.37s, tests 61ms, environment 0ms, prepare 239ms)
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

 Test Files  81 passed (81)
      Tests  257 passed (257)
   Start at  16:15:07
   Duration  2.71s (transform 3.42s, setup 0ms, collect 14.09s, tests 8.17s, environment 28ms, prepare 4.39s)
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
