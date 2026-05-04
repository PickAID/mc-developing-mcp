# Loose Resource Root Evidence Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice makes loose `assets/**` roots first-class local evidence without
adding a new public MCP tool or route step.

Implemented behavior:

- loose content roots now expose `rootKind`;
- loose file entries now expose `rootKind` and `rootRelativePath`;
- file summaries now include `byRootKind`;
- broad `resource_pack_lookup` requests return a counts-only
  `resourceRootSummary`;
- broad resource-pack summaries do not include the `files` path list by default;
- explicit path reads, resource-location search, and reference tracing keep the
  existing behavior.

## TDD Record

Adapter RED before implementation:

```text
$ pnpm exec vitest run packages/datapack-adapter/src/root-kind.test.ts

❯ packages/datapack-adapter/src/root-kind.test.ts (3 tests | 3 failed)

expected discovered root to include:
"rootKind": "resource_pack_root"

received discovered root without rootKind

expected listed file to include:
"rootKind": "workspace_assets_root"
"rootRelativePath": "."

received listed file without rootKind/rootRelativePath

expected mixed loose root entries to include:
"rootKind": "mixed_pack_root"
"rootRelativePath": "src/main/resources"

received entries without rootKind/rootRelativePath
```

MCP RED before implementation:

```text
$ pnpm exec vitest run apps/mcp-server/src/source-bundle-resource-root-summary.test.ts

❯ apps/mcp-server/src/source-bundle-resource-root-summary.test.ts (1 test | 1 failed)

Expected payload.resourceRootSummary:
{
  "tokenPolicy": "counts_only",
  "rootCount": 1,
  "byRootKind": {
    "resource_pack_root": 1
  }
}

Received payload only had:
{
  "source": "datapack_files"
}
```

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
# Creates a temporary resource-pack workspace with:
# - pack.mcmeta
# - assets/demo/lang/en_us.json
# - assets/demo/models/block/gear.json
#
# Then runs:
# "List local resource pack assets."
TS
```

Returned value:

```json
{
  "summary": "Summarized 3 local resource asset file(s).",
  "source": "datapack_files",
  "resourceSummary": {
    "tokenPolicy": "counts_only",
    "rootCount": 1,
    "entryCount": 3,
    "byRootKind": {
      "resource_pack_root": 1
    },
    "byDomain": {
      "assets": 3
    },
    "byKind": {
      "lang": 1,
      "models": 1,
      "pack_metadata": 1
    },
    "byNamespace": {
      "demo": 2,
      "": 1
    },
    "skippedCount": 0,
    "truncated": false
  },
  "resourceRootSummary": {
    "tokenPolicy": "counts_only",
    "rootCount": 1,
    "entryCount": 3,
    "byRootKind": {
      "resource_pack_root": 1
    },
    "byDomain": {
      "assets": 3
    },
    "byKind": {
      "lang": 1,
      "models": 1,
      "pack_metadata": 1
    },
    "byNamespace": {
      "demo": 2,
      "": 1
    },
    "skippedCount": 0,
    "truncated": false
  },
  "hasFilesField": false
}
```

Interpretation:

- `resourceRootSummary` is counts-only;
- the broad request does not include a `files` field;
- concrete paths remain available through explicit reads/search/trace.

## Focused Verification

Adapter focused tests:

```text
$ pnpm exec vitest run packages/datapack-adapter/src/index.test.ts packages/datapack-adapter/src/root-kind.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/datapack-adapter/src/root-kind.test.ts (3 tests) 20ms
✓ packages/datapack-adapter/src/index.test.ts (10 tests) 37ms

Test Files  2 passed (2)
Tests       13 passed (13)
Duration    290ms
```

MCP focused tests:

```text
$ pnpm exec vitest run apps/mcp-server/src/source-bundle-resource-root-summary.test.ts apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts (2 tests) 20ms
✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (5 tests) 39ms
✓ apps/mcp-server/src/source-bundle-resource-root-summary.test.ts (1 test) 12ms

Test Files  3 passed (3)
Tests       8 passed (8)
Duration    643ms
```

## Full Verification

Full workspace test:

```text
$ pnpm test

Test Files  138 passed (138)
Tests       441 passed (441)
Duration    4.09s
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
$ wc -l packages/datapack-adapter/src/root-kind.ts packages/datapack-adapter/src/discovery.ts packages/datapack-adapter/src/files.ts packages/datapack-adapter/src/types.ts packages/datapack-adapter/src/root-kind.test.ts apps/mcp-server/src/source-bundle-datapack.ts apps/mcp-server/src/source-bundle-resource-root-summary.test.ts

21 packages/datapack-adapter/src/root-kind.ts
123 packages/datapack-adapter/src/discovery.ts
428 packages/datapack-adapter/src/files.ts
150 packages/datapack-adapter/src/types.ts
119 packages/datapack-adapter/src/root-kind.test.ts
469 apps/mcp-server/src/source-bundle-datapack.ts
82 apps/mcp-server/src/source-bundle-resource-root-summary.test.ts
1392 total
```

## Notes

`datapack_files` remains the internal route step for shared `data/**` and
`assets/**` local evidence. Resource semantics are exposed through provenance
and compact payload fields, not through public tool sprawl.
