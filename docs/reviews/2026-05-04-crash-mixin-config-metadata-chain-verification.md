# Crash Mixin Config Metadata Chain Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice closes the chain from a Mixin crash log line to the owning mod JAR
metadata file.

Target log shape:

```text
Mixin apply failed demo.mixins.json:CompatMixin -> net.minecraft.client.Minecraft: org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException
```

The target class is vanilla and therefore not actionable as a class-owner query.
The useful local evidence is the Mixin config path `demo.mixins.json`, which
should flow from `workspace.analyze` into `mod_archive_content` and resolve the
JAR containing that metadata file.

## Red
Focused request-executor red test:

```bash
pnpm vitest run apps/mcp-server/src/request-executor-metadata-crash.test.ts
```

Observed failure before implementation:

```text
× executeMcpServerRequest metadata crash chaining > chains Mixin config crash signals into mod archive metadata search

actual log_files status:
  skipped

actual resourcePaths:
  []

actual metadata match:
  found only by noisy content query, not by demo.mixins.json path context
```

After extracting `demo.mixins.json` from the log, a second failure showed the
query priority issue:

```text
actual queries:
  during, Mixin, apply, inspect

expected first useful query:
  demo.mixins.json
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/request-executor-metadata-crash.test.ts
```

Result:

```text
✓ apps/mcp-server/src/request-executor-metadata-crash.test.ts (1 test) 13ms

Test Files  1 passed (1)
Tests  1 passed (1)
```

Related regression group:

```bash
pnpm vitest run apps/mcp-server/src/request-executor-metadata-crash.test.ts apps/mcp-server/src/crash-log-signals.test.ts packages/jar-source-adapter/src/archive-content.test.ts apps/mcp-server/src/mod-archive-metadata-content.test.ts
```

Result:

```text
✓ apps/mcp-server/src/crash-log-signals.test.ts (1 test) 2ms
✓ packages/jar-source-adapter/src/archive-content.test.ts (5 tests) 16ms
✓ apps/mcp-server/src/mod-archive-metadata-content.test.ts (1 test) 12ms
✓ apps/mcp-server/src/request-executor-metadata-crash.test.ts (1 test) 13ms

Test Files  4 passed (4)
Tests  8 passed (8)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  127 passed (127)
Tests  412 passed (412)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

Line count check:

```text
492 apps/mcp-server/src/mod-archive-content-executor.ts
158 apps/mcp-server/src/request-executor-metadata-crash.test.ts
482 packages/jar-source-adapter/src/archive-content.ts
411 packages/jar-source-adapter/src/archive-content.test.ts
196 apps/mcp-server/src/crash-log-signals.ts
```

## Actual Return Value
Command:

```bash
pnpm tsx -e '...executeMcpServerRequest Mixin metadata crash fixture...'
```

Return value:

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "status": "selected",
    "summary": "Found 1 mod archive content match(es).",
    "payload": {
      "source": "mod_archive_content",
      "domains": [
        "data",
        "assets",
        "java",
        "class",
        "metadata"
      ],
      "queries": [
        "demo.mixins.json",
        "during",
        "Mixin",
        "apply"
      ],
      "matches": [
        {
          "entry": {
            "relativePath": "demo.mixins.json",
            "domain": "metadata",
            "sizeBytes": 27
          },
          "line": 1,
          "column": 1,
          "preview": "demo.mixins.json",
          "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mixin-chain-actual-oLma4B/mods/mixin-mod.jar",
          "archiveMetadata": {
            "loader": "fabric",
            "modId": "demo",
            "metadataPath": "fabric.mod.json"
          }
        }
      ],
      "skipped": [],
      "truncated": false
    }
  },
  "trace": {
    "contextCandidateIds": [
      "candidate-1-log_files"
    ],
    "selectedCandidateId": "candidate-2-mod_archive_content",
    "fallbackUsed": false
  },
  "executions": [
    {
      "routeStep": "log_files",
      "status": "context",
      "summary": "Extracted 1 actionable crash signal(s) from 1 log file(s).",
      "payload": {
        "source": "workspace_analyze",
        "mode": "log_files",
        "signals": {
          "exceptionClasses": [
            "org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException"
          ],
          "resourceLocations": [],
          "resourcePaths": [
            "demo.mixins.json"
          ],
          "classReferences": [
            "net.minecraft.client.Minecraft"
          ],
          "actionableClassReferences": [],
          "stackFrames": []
        },
        "truncated": false
      }
    },
    {
      "routeStep": "mod_archive_content",
      "status": "selected",
      "summary": "Found 1 mod archive content match(es)."
    }
  ]
}
```

## Notes
- Crash log metadata paths are now treated as `resourcePaths` context signals.
- `mod_archive_content` prioritizes explicit archive/resource paths before loose
  natural-language words, avoiding token waste on noisy request text.
- Metadata files can be matched by relative path, not only by file content.
- `mod-archive-content-executor.ts` is now close to the 500-line limit and
  should be split before the next non-trivial addition.
