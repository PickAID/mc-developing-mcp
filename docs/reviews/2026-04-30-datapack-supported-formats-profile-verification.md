# Datapack Supported Formats Profile Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/datapack-adapter`, `apps/mcp-server`

## Result
- Added `pack.supported_formats` parsing to datapack version profiles.
- Supports numeric, tuple, and object-shaped supported format metadata.
- MCP compact datapack profiles now include `supportedFormats` and `compatibleMinecraftVersions`.
- The feature remains a metadata/profile layer; versioned JSON schema validation is still explicitly unavailable.
- No new public MCP tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/version-profile.test.ts apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```

Initial adapter failure:

```text
FAIL packages/datapack-adapter/src/version-profile.test.ts
  × resolveDatapackVersionProfile > reports supported pack format ranges from modern pack metadata
    → expected { source: 'pack_mcmeta', … } to match object { source: 'pack_mcmeta', … }

- Expected
+ Received

  {
-   "compatibleMinecraftVersions": [
-     "1.20.1",
-     "1.20.6",
-     "1.21.1",
-   ],
    "packFormat": 15,
-   "supportedFormats": {
-     "maxInclusive": 34,
-     "minInclusive": 15,
-   },
  }
```

Initial MCP failure:

```text
FAIL apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
  × source.bundle datapack version profile > includes supported pack format ranges in compact datapack profiles

- Expected
+ Received

  {
    "payload": {
      "datapackVersionProfile": {
-       "compatibleMinecraftVersions": [
-         "1.20.1",
-         "1.20.6",
-         "1.21.1",
-       ],
        "packFormat": 15,
-       "supportedFormats": {
-         "maxInclusive": 34,
-         "minInclusive": 15,
-       },
        "tokenPolicy": "compact_profile",
      },
    },
  }
```

## GREEN Output
Command:

```bash
pnpm typecheck && pnpm exec vitest run packages/datapack-adapter/src/version-profile.test.ts apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```

Output:

```text
✓ packages/datapack-adapter/src/version-profile.test.ts (4 tests) 9ms
✓ apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts (2 tests) 18ms

Test Files  2 passed (2)
     Tests  6 passed (6)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  103 passed (103)
     Tests  319 passed (319)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace containing:
- pack.mcmeta with pack_format 15 and supported_formats [15, 34]
- data/demo/recipes/gear.json

Called datapack source bundle executor with:
"List local datapack evidence and supported pack formats."
```

Actual selected return fields:

```json
{
  "matched": true,
  "summary": "Listed 2 local datapack or asset file(s).",
  "source": "datapack_files",
  "datapackVersionProfile": {
    "tokenPolicy": "compact_profile",
    "source": "pack_mcmeta_and_runtime",
    "confidence": "medium",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "1.20.1",
    "packFormat": 15,
    "supportedFormats": {
      "minInclusive": 15,
      "maxInclusive": 34
    },
    "compatibleMinecraftVersions": [
      "1.20.1",
      "1.20.6",
      "1.21.1"
    ],
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
332 packages/datapack-adapter/src/version-profile.ts
116 packages/datapack-adapter/src/version-profile.test.ts
328 apps/mcp-server/src/source-bundle-datapack.ts
147 apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```
