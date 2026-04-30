# Datapack Version Profile Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/datapack-adapter`, `apps/mcp-server`

## Result
- Added a compact datapack version profile resolver.
- The resolver combines `pack.mcmeta` `pack_format` evidence with workspace runtime evidence when available.
- MCP datapack payloads now include `datapackVersionProfile`.
- The profile explicitly reports support boundaries: `semanticValidation: "not_available"` and `migrationAnalysis: "not_available"`.
- Added conflict reporting when `pack.mcmeta` and runtime evidence disagree.
- Expanded loose datapack data-kind classification for `item_modifiers`, `structures`, and generic registry JSON files.
- No new public MCP tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/version-profile.test.ts apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```

Initial adapter failure:

```text
FAIL packages/datapack-adapter/src/version-profile.test.ts
Error: Cannot find module './version-profile.js'
```

Initial MCP failure:

```text
FAIL apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
  × source.bundle datapack version profile > adds compact datapack version profile evidence to local datapack payloads
    → expected { matched: true, … } to match object { matched: true, payload: { … } }

- Expected
+ Received

  {
    "matched": true,
    "payload": {
-     "datapackVersionProfile": {
-       "minecraftVersion": "1.20.1",
-       "packFormat": 15,
-       "semanticValidation": "not_available",
-       "source": "pack_mcmeta_and_runtime",
-       "supportLevel": "known_profile",
-       "tokenPolicy": "compact_profile",
-     },
      "source": "datapack_files",
    },
  }
```

## GREEN Output
Command:

```bash
pnpm typecheck && pnpm exec vitest run packages/datapack-adapter/src/kinds.test.ts packages/datapack-adapter/src/version-profile.test.ts packages/datapack-adapter/src/index.test.ts apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
✓ packages/datapack-adapter/src/kinds.test.ts (1 test) 1ms
✓ packages/datapack-adapter/src/version-profile.test.ts (3 tests) 8ms
✓ packages/datapack-adapter/src/index.test.ts (9 tests) 60ms
✓ apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts (1 test) 15ms
✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (4 tests) 36ms

Test Files  5 passed (5)
     Tests  18 passed (18)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  103 passed (103)
     Tests  317 passed (317)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace containing:
- pack.mcmeta with pack_format 15
- data/demo/recipes/gear.json

Called datapack source bundle executor with:
"List local datapack evidence and version profile."
```

Actual selected return fields:

```json
{
  "matched": true,
  "summary": "Listed 2 local datapack or asset file(s).",
  "source": "datapack_files",
  "resourceSummary": {
    "tokenPolicy": "counts_only",
    "rootCount": 1,
    "entryCount": 2,
    "byDomain": {
      "data": 1,
      "assets": 1
    },
    "byKind": {
      "recipes": 1,
      "pack_metadata": 1
    },
    "byNamespace": {
      "demo": 1,
      "": 1
    },
    "skippedCount": 0,
    "truncated": false
  },
  "datapackVersionProfile": {
    "tokenPolicy": "compact_profile",
    "source": "pack_mcmeta_and_runtime",
    "confidence": "medium",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "1.20.1",
    "packFormat": 15,
    "knownDataKinds": [
      "advancements",
      "damage_type",
      "functions",
      "item_modifiers",
      "loot_tables",
      "predicates",
      "recipes",
      "registry",
      "structures",
      "tags",
      "worldgen"
    ],
    "semanticValidation": "not_available",
    "migrationAnalysis": "not_available",
    "notes": [
      "profile describes version evidence and broad data kind support only",
      "versioned JSON schema validation is not implemented yet",
      "version-to-version datapack migration analysis is not implemented yet"
    ]
  }
}
```

## Guards
Commands:

```bash
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output:

```text
No output.
```

Line-count spot check:

```text
246 packages/datapack-adapter/src/version-profile.ts
 87 packages/datapack-adapter/src/version-profile.test.ts
 11 packages/datapack-adapter/src/kinds.test.ts
326 apps/mcp-server/src/source-bundle-datapack.ts
 87 apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
361 packages/datapack-adapter/src/index.test.ts
```
