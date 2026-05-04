# Crash Resource Path Trace Routing Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice routes explicit `assets/.../*.json` paths found in crash logs into
`mod_archive_content` resource reference tracing.

Implemented behavior:

- `log_files` still runs first and becomes context when actionable crash signals
  are found;
- crash log `resourcePaths` are injected into the next request context as
  `Crash log resource paths: ...`;
- `mod_archive_content` treats that context marker as explicit trace intent and
  returns `payload.mode = "resource_reference_trace"`;
- when a modpack has multiple JARs and the request does not name one, the
  executor finds the first archive that can trace the logged resource path;
- the trace starts from the logged asset path and follows item model to model
  texture references.

No public MCP tool or route step was added. This is crash triage routing, not
full resource-pack validation.

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { buildMcpServerBootstrap } from "./apps/mcp-server/src/bootstrap.js";
import { executeMcpServerRequest } from "./apps/mcp-server/src/request-executor.js";

// Creates logs/latest.log with assets/demo/items/gear.json, one unrelated
// mod jar, and one content mod jar containing the item model, model json,
// and texture target.
// Then prints { executions, trace } from executeMcpServerRequest.
TS
```

Returned shape from the double-JAR smoke:

```json
{
  "executions": [
    {
      "candidateId": "candidate-1-log_files",
      "routeStep": "log_files",
      "status": "context",
      "summary": "Extracted 1 actionable crash signal(s) from 1 log file(s).",
      "payload": {
        "source": "workspace_analyze",
        "mode": "log_files",
        "signals": {
          "exceptionClasses": ["java.io.FileNotFoundException"],
          "resourceLocations": [],
          "resourcePaths": ["assets/demo/items/gear.json"],
          "loaderModReferences": [],
          "classReferences": [],
          "actionableClassReferences": [],
          "stackFrames": []
        },
        "truncated": false
      }
    },
    {
      "candidateId": "candidate-2-mod_archive_content",
      "routeStep": "mod_archive_content",
      "pathHints": [
        "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-resource-crash-smoke-pw01pS/mods/aaa-unrelated-mod.jar",
        "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-resource-crash-smoke-pw01pS/mods/content-mod.jar"
      ],
      "status": "selected",
      "summary": "Traced 2 mod archive resource reference(s).",
      "payload": {
        "source": "mod_archive_content",
        "mode": "resource_reference_trace",
        "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-resource-crash-smoke-pw01pS/mods/content-mod.jar",
        "resourceReferenceTrace": {
          "tokenPolicy": "explicit_trace",
          "startPaths": ["assets/demo/items/gear.json"],
          "referenceCount": 2,
          "unresolvedCount": 0,
          "references": [
            {
              "fromPath": "assets/demo/items/gear.json",
              "fromKind": "items",
              "relation": "item_model",
              "value": "demo:item/gear",
              "toPath": "assets/demo/models/item/gear.json",
              "toKind": "models",
              "status": "resolved"
            },
            {
              "fromPath": "assets/demo/models/item/gear.json",
              "fromKind": "models",
              "relation": "model_texture",
              "value": "demo:item/gear",
              "toPath": "assets/demo/textures/item/gear.png",
              "toKind": "textures",
              "status": "resolved"
            }
          ],
          "unresolved": [],
          "skippedCount": 0,
          "truncated": false
        }
      }
    }
  ],
  "trace": {
    "routeSteps": [
      "log_files",
      "mod_archive_content",
      "external_mod_resolution",
      "workspace_source",
      "docs_lookup"
    ],
    "executedCandidateIds": [
      "candidate-1-log_files",
      "candidate-2-mod_archive_content"
    ],
    "contextCandidateIds": ["candidate-1-log_files"],
    "selectedCandidateId": "candidate-2-mod_archive_content",
    "fallbackUsed": false
  }
}
```

The temporary absolute paths above were retained from the smoke output to show
that the unrelated JAR was considered but `mods/content-mod.jar` was selected.

## TDD Record

RED focused failure before implementation:

```text
$ pnpm exec vitest run apps/mcp-server/src/request-executor-resource-crash.test.ts

Expected payload.mode to be "resource_reference_trace".
Received payload.mode "read".
```

RED review follow-up for modpack scale:

```text
$ pnpm exec vitest run apps/mcp-server/src/request-executor-resource-crash.test.ts

Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)

Expected mod_archive_content to be selected with mode "resource_reference_trace".
Received mod_archive_content status "skipped" with summary:
No mod archive content matched assets/demo/items/gear.json, client, during, loading.
The request then selected external_mod_resolution.
```

GREEN focused verification after implementation:

```text
$ pnpm exec vitest run apps/mcp-server/src/request-executor-resource-crash.test.ts apps/mcp-server/src/mod-archive-resource-references.test.ts packages/jar-source-adapter/src/mod-archive-resource-references.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/jar-source-adapter/src/mod-archive-resource-references.test.ts (4 tests) 12ms
✓ apps/mcp-server/src/mod-archive-resource-references.test.ts (3 tests) 17ms
✓ apps/mcp-server/src/request-executor-resource-crash.test.ts (2 tests) 16ms

Test Files  3 passed (3)
Tests       9 passed (9)
Duration    636ms
```

## Full Verification

Full workspace test:

```text
$ pnpm test

Test Files  135 passed (135)
Tests       433 passed (433)
Duration    3.66s
```

Whitespace guard:

```text
$ git diff --check

# no output
```

Line-count guard:

```text
$ find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'

# no output
```

Go cleanup guard:

```text
$ find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print

# no output
```

Focused file line counts:

```text
$ wc -l apps/mcp-server/src/mod-archive-content-executor.ts apps/mcp-server/src/mod-archive-resource-references.ts apps/mcp-server/src/request-executor-resource-crash.test.ts

432 apps/mcp-server/src/mod-archive-content-executor.ts
200 apps/mcp-server/src/mod-archive-resource-references.ts
260 apps/mcp-server/src/request-executor-resource-crash.test.ts
892 total
```

## Notes

The routing trigger is intentionally narrow. It only upgrades the archive read
to a resource reference trace when a traceable `assets/.../*.json` path exists
and the enriched crash context includes `Crash log resource paths:`. It does not
scan every resource file in the archive or attempt broad validation.
