# MCP ProbeJS Language Service Integration Verification

Date: 2026-04-27

Scope:

- `apps/mcp-server`
- `packages/kubejs-language-service`
- `packages/kubejs-types-adapter`
- `packages/jar-source-adapter`
- `packages/service-profile`
- `packages/workspace-detector`

## Result

`context.query` now handles the internal `probejs_types` route through the KubeJS TypeScript language service by default.

This does not add a new public MCP tool. The public surface remains progressive: request planning chooses `probejs_types`, and the internal executor resolves ProbeJS `.d.ts` content only when that route is needed.

## Integrated Flow

Input route:

```text
context.query -> probejs_types
```

Executor behavior:

- Reads `workspaceContext.workspaceRoot` from the MCP request plan.
- Extracts the requested KubeJS symbol from request text, for example `ItemEvents.foodEaten`.
- Finds a KubeJS script under `kubejs/` or `local/kubejs/`.
- Classifies script scope as `server`, `startup`, `client`, or `shared`.
- Discovers matching ProbeJS declarations from scoped `.probe/<scope>` plus `.probe/shared`, with legacy flat `.probe/*.d.ts` fallback handled by the language-service package.
- Discovers compact ProbeJS semantic resources from `.vscode/*.code-snippets`, VS Code ProbeJS JSON, legacy `.probe/classes.txt`, and legacy `kubejs/probejs/{snippets,items,registries}` roots.
- Creates or reuses an in-process TypeScript `LanguageService`.
- Returns completions, quick info, compact diagnostics, declaration counts, byte counts, snippet counts, and token-efficient ProbeJS resources.
- Uses an internal LRU cache keyed by workspace, scope, script fingerprint, and ProbeJS declaration fingerprints. The requested symbol is intentionally excluded; the virtual query file is updated inside the cached project so repeated symbols do not create duplicate TypeScript language services.
- The default MCP ProbeJS language-project cache is capped at one project to avoid retaining multiple large modpack TypeScript projects in one long-lived MCP process. Injected caches can still raise the cap for controlled harness runs.

## Actual Return Value

Command:

```sh
node --input-type=module <<'EOF'
// Creates a temporary KubeJS workspace with one script, one ProbeJS d.ts,
// one VS Code snippet file, one ProbeJS item file, and one registry file,
// then builds the MCP request/evidence plan and calls the ProbeJS executor.
EOF
```

Observed output:

```json
{
  "matched": true,
  "summary": "Resolved ItemEvents.foodEaten from ProbeJS TypeScript language service.",
  "payload": {
    "source": "kubejs_language_service",
    "scope": "server",
    "symbol": "ItemEvents.foodEaten",
    "scriptFile": "<workspace>/kubejs/server_scripts/main.js",
    "declarationCount": 1,
    "declarationBytes": 102,
    "snippetCount": 1,
    "cacheHit": false,
    "probeResources": {
      "summary": {
        "counts": {
          "snippet": 1,
          "item": 1,
          "registry": 1
        },
        "discoveredFiles": 4,
        "searchedFiles": 3,
        "truncated": false
      },
      "entries": {
        "snippet": [
          {
            "sourceKind": "snippet",
            "extractorId": "vscode-code-snippets-json-v1",
            "sourceFormat": "vscode-code-snippets-json",
            "confidence": 0.95,
            "name": "Food Eaten",
            "value": "ItemEvents.foodEaten",
            "file": ".vscode/probe.code-snippets",
            "metadata": {
              "description": "Run when food is eaten"
            }
          }
        ],
        "item": [
          {
            "sourceKind": "item",
            "extractorId": "probejs-line-list-v1",
            "sourceFormat": "text-line-list",
            "confidence": 0.75,
            "name": "minecraft:stone",
            "value": "minecraft:stone",
            "file": "kubejs/probejs/items/minecraft.txt",
            "lineNumber": 1
          }
        ],
        "registry": [
          {
            "sourceKind": "registry",
            "extractorId": "probejs-line-list-v1",
            "sourceFormat": "text-line-list",
            "confidence": 0.75,
            "name": "minecraft:block",
            "value": "minecraft:block",
            "file": "kubejs/probejs/registries/blocks.txt",
            "lineNumber": 1
          }
        ]
      },
      "unknownResources": []
    },
    "completions": [
      {
        "name": "foodEaten",
        "kind": "method"
      }
    ],
    "quickInfo": "(method) foodEaten(handler: (event: {\n    item: {\n        id: string;\n    };\n}) => void): void",
    "diagnostics": []
  }
}
```

Repeated query with the same workspace, script, scope, and ProbeJS declarations:

```json
{
  "matched": true,
  "cacheHit": true,
  "completionCount": 1,
  "diagnostics": []
}
```

## Real KJS Mod Run Smoke

Command:

```sh
node --input-type=module <<'EOF'
// Runs createMcpServerProbeJsTypesExecutor() against real local Gradle/KubeJS
// run directories, querying ItemEvents.foodEaten through a virtual query script.
EOF
```

Observed:

```json
[
  {
    "workspaceRoot": "/Users/gedwen/Documents/programing/MC/PmmoJS/run",
    "matched": true,
    "scope": "server",
    "queryMode": "virtual",
    "declarationCount": 378,
    "completionCount": 11,
    "cacheHit": false,
    "quickInfoSample": "function ItemEvents.foodEaten(extra: $Item$$Type, handler: ((event: $FoodEatenEventJS) => void)): void (+1 overload)",
    "probeResourceCounts": {
      "snippet": 0,
      "item": 0,
      "registry": 0,
      "fluid": 0,
      "tag": 0,
      "language_key": 0,
      "class": 1
    },
    "unknownCount": 0,
    "diagnostics": []
  },
  {
    "workspaceRoot": "/Users/gedwen/Documents/programing/MC/SanityJS/run",
    "matched": true,
    "scope": "server",
    "queryMode": "virtual",
    "declarationCount": 45,
    "completionCount": 16,
    "cacheHit": false,
    "quickInfoSample": "(method) foodEaten(extra: Special.Item, handler: (event: Internal.FoodEatenEventJS) => void): void (+1 overload)",
    "probeResourceCounts": {
      "snippet": 0,
      "item": 0,
      "registry": 0,
      "fluid": 0,
      "tag": 0,
      "language_key": 0,
      "class": 1
    },
    "unknownCount": 0,
    "diagnostics": []
  },
  {
    "workspaceRoot": "/Users/gedwen/Documents/programing/MC/MnaJS/run/client",
    "matched": true,
    "scope": "server",
    "queryMode": "virtual",
    "declarationCount": 364,
    "completionCount": 11,
    "cacheHit": false,
    "quickInfoSample": "function ItemEvents.foodEaten(extra: $Item$$Type, handler: ((event: $FoodEatenEventJS) => void)): void (+1 overload)",
    "probeResourceCounts": {
      "snippet": 0,
      "item": 0,
      "registry": 0,
      "fluid": 0,
      "tag": 0,
      "language_key": 0,
      "class": 1
    },
    "unknownCount": 0,
    "diagnostics": []
  },
  {
    "workspaceRoot": "/Users/gedwen/Documents/programing/MC/PassiveSkillTreeIntegration/run/client",
    "matched": true,
    "scope": "server",
    "queryMode": "virtual",
    "declarationCount": 47,
    "completionCount": 16,
    "cacheHit": false,
    "quickInfoSample": "(method) foodEaten(extra: Internal.Item_, handler: (event: Internal.FoodEatenEventJS) => void): void (+1 overload)",
    "probeResourceCounts": {
      "snippet": 0,
      "item": 0,
      "registry": 0,
      "fluid": 0,
      "tag": 0,
      "language_key": 1,
      "class": 1
    },
    "unknownCount": 0,
    "diagnostics": []
  }
]
```

Interpretation:

- `.probe/<scope>` layouts work for PmmoJS and MnaJS.
- `kubejs/probe/generated/*.d.ts` legacy layouts work for SanityJS and PassiveSkillTreeIntegration.
- Virtual query scripts remove the old requirement that `ItemEvents.foodEaten` must already appear in user scripts.
- Query diagnostics are scoped to the virtual query file, so unrelated existing KubeJS script errors do not pollute `probejs_types`.
- ProbeJS resources are filtered by request-derived query terms, so symbol-only requests do not return unrelated item, registry, fluid, tag, schema, or class previews.
- Large `.vscode/probe.code-snippets` files are parsed as JSON before falling back to line parsing.
- Real `.vscode/item-attributes.json`, `.vscode/fluid-attributes.json`, and `.vscode/item-tag-attributes.json` files are parsed into high-confidence `item`, `fluid`, and `tag` entries.
- Real `.vscode/lang-keys.json`, `.vscode/probe.class-definitions.json`, `.vscode/probe.registry-definitions.json`, and legacy `.probe/classes.txt` are parsed into `language_key`, `class`, and `registry` entries.
- Duplicate semantic resources with the same kind and name are collapsed, keeping the higher-confidence source.
- A previous same-process smoke over four real run directories hit V8 OOM near 4GB because the cache retained multiple large TypeScript projects and keyed projects by requested symbol. After excluding symbol from the cache key, updating the virtual query file in-place, and capping the default MCP cache to one project, the same four-directory smoke exits successfully.
- Remaining unknown ProbeJS files are mostly schema/helper files such as `.vscode/probe.doc-schema.json`, `.vscode/probe.lang_key-definitions.json`, `.vscode/probe.lang-schema.json`, and `.vscode/settings.json`.

## Test Coverage

Added MCP integration coverage in:

```text
apps/mcp-server/src/context-query-executor.test.ts
```

The test creates a real temporary workspace:

```text
kubejs/server_scripts/main.js
.probe/server/events.d.ts
```

Expected behavior:

- The default `buildMcpServerContextQueryExecutor()` handles `probejs_types`.
- The returned payload source is `kubejs_language_service`.
- The scope resolves to `server`.
- The symbol resolves to `ItemEvents.foodEaten`.
- Quick info includes the typed `foodEaten(handler...)` signature.
- Diagnostics are empty.
- Completions include `foodEaten`.

Added cache-specific coverage in:

```text
apps/mcp-server/src/probejs-types-executor.test.ts
```

Expected behavior:

- First semantic query returns `cacheHit: false`.
- Second identical semantic query returns `cacheHit: true`.
- Different symbols in the same workspace reuse the same cached TypeScript project by updating the virtual query file.
- The injected language-project cache holds one project.
- Compact `probeResources` contains only matching item, fluid, tag, registry, language key, class, and snippet entries with relative file paths only.
- Symbol-only requests omit unrelated ProbeJS resources and unknown previews.
- Virtual query scripts allow semantic lookup even when the requested symbol is absent from existing project scripts.
- Unrelated diagnostics from selected workspace scripts are not returned for `probejs_types`.

Added type-resource summary coverage in:

```text
packages/kubejs-types-adapter/src/summary.test.ts
```

Expected behavior:

- `.vscode/*.code-snippets` is parsed as snippet resources.
- Large `.vscode/*.code-snippets` JSON files are read with a larger snippet-specific budget before fallback.
- `kubejs/probejs/items/*.txt` is parsed as item resources.
- `.vscode/item-attributes.json` is parsed as high-confidence item resources.
- `.vscode/fluid-attributes.json` is parsed as high-confidence fluid resources.
- `.vscode/item-tag-attributes.json` is parsed as high-confidence item tag resources.
- `.vscode/lang-keys.json` is parsed as high-confidence language key resources with selected labels.
- `.vscode/probe.class-definitions.json` is parsed as high-confidence Java class resources.
- `.vscode/probe.registry-definitions.json` is parsed as high-confidence registry resources with registry type metadata.
- `.probe/classes.txt` compressed legacy class lists are expanded into Java class resources.
- `kubejs/probejs/registries/*.txt` is parsed as registry resources.
- Unsupported ProbeJS files are returned as compact `unknownResources` with previews and low confidence.
- Per-kind entry budgets mark the summary as truncated when more resources exist.
- Optional `resourceQueries` filter returned entries without changing the public MCP tool surface.
- Matching entries are deduplicated by semantic kind and name, preferring higher-confidence extractors.

Added language-service coverage in:

```text
packages/kubejs-language-service/src/language-service.test.ts
```

Expected behavior:

- Virtual query files can be updated without recreating the TypeScript language-service project.
- Quick info after update reflects the new virtual query content.

## Command Results

### MCP Server Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/mcp-server test
```

Observed:

```text
Test Files  11 passed (11)
Tests  27 passed (27)
```

After cache integration:

```text
Test Files  12 passed (12)
Tests  33 passed (33)
```

After mod archive context-query integration:

```text
Test Files  12 passed (12)
Tests  35 passed (35)
```

After selected mod jar entry list/read integration:

```text
Test Files  13 passed (13)
Tests  37 passed (37)
```

After mod archive central-directory/text-entry cache integration:

```text
Test Files  13 passed (13)
Tests  38 passed (38)
```

### KubeJS Language Service Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/kubejs-language-service test -- src/language-service.test.ts
```

Observed:

```text
Test Files  4 passed (4)
Tests  12 passed (12)
```

### KubeJS Types Adapter Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/kubejs-types-adapter test
```

Observed:

```text
Test Files  3 passed (3)
Tests  15 passed (15)
```

### Jar Source Adapter Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/jar-source-adapter test
```

Observed:

```text
Test Files  3 passed (3)
Tests  7 passed (7)
```

### Agent Harness Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/agent-harness test
```

Observed:

```text
Test Files  9 passed (9)
Tests  41 passed (41)
```

### Workspace Detector Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/workspace-detector test
```

Observed:

```text
Test Files  1 passed (1)
Tests  10 passed (10)
```

Red/green note:

- Red: `kubejs/` plus `mods/content-mod.jar` was incorrectly detected as `kubejs`.
- Green: the same layout is now detected as `modpack` and includes `detected runtime mod jars` in reasons.

### Service Profile Package

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/service-profile test
```

Observed:

```text
Test Files  1 passed (1)
Tests  1 passed (1)
```

### Full Test Suite

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
```

Observed:

```text
Test Files  58 passed (58)
Tests  196 passed (196)
```

### Typecheck

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
```

Observed:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Exit code: `0`

### No-Go Check

Command:

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed:

```text

```

Meaning: no Go source/module files were found outside `node_modules`.

### 500 Line Check

Command:

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/tests -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text

```

Meaning: no checked source/test TypeScript file exceeds 500 lines.

## Current Limits

- The MCP executor uses size/mtime fingerprints, not content hashes. This is fast and practical, but a same-size same-mtime rewrite could theoretically keep stale cache.
- Symbol extraction is intentionally simple and currently uses the first dotted identifier in request text.
- Script selection is scope-aware but not yet ranked by recent edit, explicit path, or request-local context.
- Snippet files, line-list resources, VS Code attribute JSON, language keys, class definitions, registry definitions, and legacy class lists are parsed into compact payloads, but ProbeJS documentation schema files are not yet semantically indexed.
- Cache TTL and explicit memory-pressure callbacks are not implemented yet; current release control is conservative default LRU eviction, TypeScript `LanguageService.dispose()`, virtual query file reuse, and explicit cache clearing for injected caches.

## Jar Content and Modpack Profile Extension

This stage adds direct jar content evidence without forcing full extraction:

- `listArchiveContent` lists text-like Minecraft-relevant entries from one jar by domain: `java`, `data`, `assets`.
- `readArchiveContentFile` reads one selected jar entry with size and binary guards.
- `searchArchiveContent` searches one jar and returns entry path, line, column, and compact preview.
- `discoverModArchives` finds runtime mod jars in `mods/`, `run/mods/`, `run/client/mods/`, `libs/`, and `build/libs`, excluding `sources` and `javadoc` jars.
- `searchArchiveSetContent` searches across multiple jars with `maxArchives`, `maxMatches`, and per-file byte budgets.
- `buildMinecraftServiceProfile` now includes a `modArchives` capability and injects guidance telling the agent to inspect discovered mod jar data/assets/source content before assuming external mod content is absent.
- `detectWorkspace` now treats KubeJS plus runtime mod jars as `modpack` even without Prism metadata. Config-only Prism-like directories remain `unknown`.

This is still an internal progressive capability. It does not add a new broad public MCP method yet; it gives the profile and future request planner better evidence for choosing jar-backed retrieval.

## Jar Direct Operation Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script creating two temporary mod jars, then calling list/read/search/discover/search-set APIs>'
```

One first attempt failed because `tsx --eval` compiled top-level await as CommonJS:

```text
ERROR: Top-level await is currently not supported with the "cjs" output format
```

The script was wrapped in `main()` and rerun.

Observed output:

```json
{
  "discovered": {
    "archives": [
      {
        "relativePath": "mods/content-a.jar",
        "source": "mods-directory"
      },
      {
        "relativePath": "mods/content-b.jar",
        "source": "mods-directory"
      }
    ],
    "truncated": false
  },
  "list": {
    "entries": [
      {
        "relativePath": "assets/demo/lang/en_us.json",
        "domain": "assets",
        "sizeBytes": 26
      },
      {
        "relativePath": "com/example/Example.java",
        "domain": "java",
        "sizeBytes": 45
      },
      {
        "relativePath": "data/demo/recipes/problem.json",
        "domain": "data",
        "sizeBytes": 49
      }
    ],
    "truncated": false
  },
  "read": {
    "entry": {
      "relativePath": "data/demo/recipes/problem.json",
      "domain": "data",
      "sizeBytes": 49
    },
    "content": "{\"id\":\"problematic_recipe\",\"result\":\"demo:gear\"}\n"
  },
  "search": {
    "matches": [
      {
        "entry": {
          "relativePath": "data/demo/recipes/problem.json",
          "domain": "data",
          "sizeBytes": 49
        },
        "line": 1,
        "column": 8,
        "preview": "{\"id\":\"problematic_recipe\",\"result\":\"demo:gear\"}"
      }
    ],
    "skipped": [],
    "truncated": false
  },
  "multi": {
    "matches": [
      {
        "entry": {
          "relativePath": "data/demo/recipes/problem.json",
          "domain": "data",
          "sizeBytes": 49
        },
        "line": 1,
        "column": 38,
        "preview": "{\"id\":\"problematic_recipe\",\"result\":\"demo:gear\"}",
        "sourceArchive": "<temp>/mods/content-a.jar"
      },
      {
        "entry": {
          "relativePath": "data/demo/tags/items/gears.json",
          "domain": "data",
          "sizeBytes": 25
        },
        "line": 1,
        "column": 13,
        "preview": "{\"values\":[\"demo:gear\"]}",
        "sourceArchive": "<temp>/mods/content-b.jar"
      }
    ],
    "skipped": [],
    "searchedArchives": 2,
    "truncated": false
  }
}
```

## LostCivilization Service Profile Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script calling buildMinecraftServiceProfile on /Users/gedwen/Library/Application Support/PrismLauncher/instances/LostCivilization/minecraft>'
```

The first run before the detector fix returned:

```json
{
  "workspaceKind": "kubejs",
  "capabilities": {
    "kubejsTypes": "ready",
    "datapack": "ready",
    "modArchives": "ready"
  }
}
```

That was incorrect for pipeline priority: a KubeJS instance with actual `mods/*.jar` content is a modpack scenario even if Prism metadata is absent.

After adding the failing test and detector fix, observed output:

```json
{
  "workspaceKind": "modpack",
  "runtime": {
    "source": "unknown",
    "confidence": "unknown",
    "evidenceSources": [],
    "candidates": [],
    "evidence": []
  },
  "capabilities": {
    "gradle": {
      "status": "not_found",
      "buildFileCount": 0,
      "sourceArchiveCount": 0,
      "sourceArchives": []
    },
    "kubejsTypes": {
      "status": "ready",
      "rootCount": 2,
      "fileCount": 256,
      "bySourceKind": {
        "dts": 251,
        "item": 0,
        "other": 3,
        "registry": 0,
        "snippet": 2
      }
    },
    "datapack": {
      "status": "ready",
      "rootCount": 5,
      "fileCount": 256,
      "namespaces": [
        "curios",
        "en-US",
        "global",
        "kubejs",
        "ldlib",
        "mbd2",
        "ponderjs_generated",
        "tacz",
        "zh-CN"
      ],
      "dataKinds": [
        "other",
        "recipes",
        "tags"
      ],
      "assetKinds": [
        "lang",
        "other",
        "textures"
      ]
    },
    "modArchives": {
      "status": "ready",
      "archiveCount": 8,
      "archives": [
        {
          "relativePath": "mods/animationjs-1.20.1-0.1.2.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/apothecary-1.2.5-1.20.1.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/ApothicAttributes-1.20.1-1.3.7.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/architectury-9.2.14-forge.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/AttributeFix-Forge-1.20.1-21.0.5.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/classjs-1.20.1-0.1-alpha.6.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/clientsort-forge-2.2.1+1.20.1.jar",
          "source": "mods-directory"
        },
        {
          "relativePath": "mods/cloth-config-11.1.136-forge.jar",
          "source": "mods-directory"
        }
      ],
      "truncated": true
    }
  },
  "guidance": [
    "Use ProbeJS/d.ts evidence before generic JavaScript assumptions for KubeJS.",
    "Use datapack data/assets namespaces and concrete JSON content before docs fallback.",
    "Use discovered mod jar data/assets/source content for external mod evidence before assuming it is absent."
  ],
  "prompt": "Workspace kind: modpack\nRuntime: unknown / unknown\nGradle: not_found, source archives=0\nJava LSP: not_java_workspace, implemented=definition,references,hover,workspaceSymbol,diagnostics\nProbeJS types: ready, files=256\nDatapack: ready, namespaces=curios,en-US,global,kubejs,ldlib,mbd2,ponderjs_generated,tacz,zh-CN\nMod archives: ready, archives=8\nSource indexes: not_found, databases=0\nGuidance: Use ProbeJS/d.ts evidence before generic JavaScript assumptions for KubeJS.\nGuidance: Use datapack data/assets namespaces and concrete JSON content before docs fallback.\nGuidance: Use discovered mod jar data/assets/source content for external mod evidence before assuming it is absent."
}
```

Interpretation:

- The service does not assume Prism metadata. Runtime remains `unknown` when there is no reliable version/loader evidence.
- The workspace kind is still `modpack` because concrete `mods/*.jar`, KubeJS, datapack, and ProbeJS evidence exist.
- Mod archive discovery is budgeted: this smoke requested only 8 archives and returned `truncated: true`.
- The prompt fragment now gives an agent enough high-level guidance to prefer ProbeJS, datapack JSON/assets, and mod jar content before generic JS/docs guessing.

## MCP Mod Archive Context Query Integration

This stage wires mod jar content into the internal MCP evidence chain without adding a new public tool.

New internal route:

```text
context.query -> mod_archive_content
```

Routing behavior:

- Modpack default route now becomes `workspace_source -> mod_archive_content -> docs_lookup` when runtime mod jars are detected.
- Crash triage in modpacks becomes `log_files -> mod_archive_content -> workspace_source -> docs_lookup`.
- KubeJS modpack authoring becomes `probejs_types -> mod_archive_content -> docs_lookup`.
- Datapack/data lookups in modpacks become `datapack_files -> mod_archive_content -> docs_lookup`.
- Public tool names stay unchanged. `mod_archive_content` is an internal evidence route handled by `context.query`.

Jar search behavior:

- Searches `data`, `assets`, `java`, and `class` domains.
- `data`, `assets`, and `java` search file text with byte and binary guards.
- `class` searches jar entry paths directly, so crash stack traces can identify which mod jar contains a class without reading bytecode.
- If a request names a concrete jar entry, `mod_archive_content` switches to `read` mode and returns that selected text entry only.
- If a request asks to list entries from a concrete jar, `mod_archive_content` switches to `list` mode and returns budgeted entry metadata only.
- Request text is converted into a small query set from resource ids, fully qualified Java class names, and selected long tokens.
- Search stops after the first query that returns matches, with archive, match, byte, and query budgets.
- Evidence path hints are capped to 16 jar paths plus a `mod-archive-hints:truncated:<count>` marker to avoid large prompt payloads.

### Synthetic MCP Return Value

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/mcp-server test
```

Relevant test:

```text
apps/mcp-server/src/context-query-executor.test.ts
```

Observed behavior:

```json
{
  "matched": true,
  "payload": {
    "source": "mod_archive_content",
    "queries": [
      "demo:gear"
    ],
    "searchedArchives": 1,
    "matches": [
      {
        "entry": {
          "domain": "data",
          "relativePath": "data/demo/recipes/gear.json"
        },
        "preview": "{\"result\":\"demo:gear\"}",
        "sourceArchive": "<temp>/mods/content-mod.jar"
      }
    ]
  }
}
```

### LostCivilization MCP Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script building MCP bootstrap/request/evidence plan for LostCivilization, then executing candidate-2-mod_archive_content>'
```

Observed output summary:

```json
{
  "routeSteps": [
    "workspace_source",
    "mod_archive_content",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-2-mod_archive_content",
    "pathHintCount": 17,
    "pathHints": [
      "mods/animationjs-1.20.1-0.1.2.jar",
      "mods/apothecary-1.2.5-1.20.1.jar",
      "mods/ApothicAttributes-1.20.1-1.3.7.jar",
      "mod-archive-hints:truncated:84"
    ]
  },
  "matched": true,
  "summary": "Found 12 mod archive content match(es).",
  "payload": {
    "source": "mod_archive_content",
    "domains": [
      "data",
      "assets",
      "java",
      "class"
    ],
    "queries": [
      "animationjs"
    ],
    "archiveCount": 64,
    "searchedArchives": 1,
    "matchCount": 12,
    "matches": [
      {
        "entry": {
          "relativePath": "net/liopyu/animationjs/AnimationJS.class",
          "domain": "class",
          "sizeBytes": 552
        },
        "line": 1,
        "column": 12,
        "preview": "net/liopyu/animationjs/AnimationJS.class",
        "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar"
      },
      {
        "entry": {
          "relativePath": "net/liopyu/animationjs/AnimationJSPlugin.class",
          "domain": "class",
          "sizeBytes": 682
        },
        "line": 1,
        "column": 12,
        "preview": "net/liopyu/animationjs/AnimationJSPlugin.class",
        "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar"
      }
    ],
    "skippedCount": 1,
    "truncated": true
  }
}
```

Interpretation:

- The planner correctly selects jar content before docs for a real modpack.
- The executor can identify classes inside runtime mod jars through entry-path search.
- Full jar content is not extracted.
- Large assets are skipped with a compact reason instead of being returned.
- Runtime `.class` matches identify owning jars and class paths; they are not decompiled source yet.

### LostCivilization Entry List/Read Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script executing list/read requests through context.query -> mod_archive_content>'
```

One first attempt failed because `tsx --eval` compiled top-level await as CommonJS:

```text
ERROR: Top-level await is currently not supported with the "cjs" output format
```

The script was wrapped in `main()` and rerun.

List request:

```text
List assets entries in mods/animationjs-1.20.1-0.1.2.jar.
```

Observed output:

```json
{
  "matched": true,
  "summary": "Listed 3 mod archive entrie(s).",
  "payload": {
    "source": "mod_archive_content",
    "mode": "list",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "domains": [
      "assets"
    ],
    "entries": [
      {
        "relativePath": "assets/animationjs/player_animation/sasuke.json",
        "domain": "assets",
        "sizeBytes": 190891
      },
      {
        "relativePath": "assets/animationjs/player_animation/smith.json",
        "domain": "assets",
        "sizeBytes": 6377
      },
      {
        "relativePath": "assets/animationjs/player_animation/waving.json",
        "domain": "assets",
        "sizeBytes": 4360
      }
    ],
    "truncated": false
  }
}
```

Read request for an oversized file:

```text
Read assets/animationjs/player_animation/sasuke.json from mods/animationjs-1.20.1-0.1.2.jar.
```

Observed output:

```json
{
  "matched": false,
  "summary": "Could not read assets/animationjs/player_animation/sasuke.json from selected mod archive.",
  "payload": {
    "source": "mod_archive_content",
    "mode": "read",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "skipped": {
      "relativePath": "assets/animationjs/player_animation/sasuke.json",
      "reason": "too-large"
    }
  }
}
```

Read request for a selected small text entry:

```text
Read assets/animationjs/player_animation/waving.json from mods/animationjs-1.20.1-0.1.2.jar.
```

Observed output:

```json
{
  "matched": true,
  "summary": "Read assets/animationjs/player_animation/waving.json from selected mod archive.",
  "payload": {
    "source": "mod_archive_content",
    "mode": "read",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "entry": {
      "relativePath": "assets/animationjs/player_animation/waving.json",
      "domain": "assets",
      "sizeBytes": 4360
    },
    "contentSample": "{\\r\\n  \"version\": 1,\\r\\n  \"uuid\": \"33b912f8-0aa0-45e6-a2d4-9b5677e6f35c\",\\r\\n  \"name\": \"waving\""
  }
}
```

Interpretation:

- The agent can now search a mod jar, then ask for one selected entry without rescanning broad context.
- Oversized files return a compact skip reason instead of consuming tokens.
- Listing provides size metadata, so the agent can decide whether a follow-up read is worth the token cost.

## Mod Archive Cache Integration

This stage adds a lightweight in-process cache for mod archive content operations.

Cache behavior:

- `createArchiveContentCache()` caches ZIP central directory metadata by archive path, size, and mtime.
- The cache does not retain the full jar buffer.
- Selected text-entry reads are cached separately by archive fingerprint, entry path, and byte budget.
- Both central-directory and text-entry caches are bounded LRU maps.
- `clear()` releases cached metadata/content.
- `size()` exposes current cache counts for harness/debug inspection.
- MCP `mod_archive_content` creates a per-executor cache by default, and tests can inject a cache to verify or clear it.

### LostCivilization Cache Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script executing repeated list/read requests with an injected mod archive cache>'
```

Repeated list request:

```text
List assets entries in mods/animationjs-1.20.1-0.1.2.jar.
```

Observed output:

```json
{
  "first": {
    "matched": true,
    "mode": "list",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "entryCount": 3,
    "cache": {
      "centralDirectoryHit": false
    },
    "truncated": false
  },
  "second": {
    "matched": true,
    "mode": "list",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "entryCount": 3,
    "cache": {
      "centralDirectoryHit": true
    },
    "truncated": false
  },
  "cacheSize": {
    "centralDirectories": 1,
    "textFiles": 0
  }
}
```

Repeated read request:

```text
Read assets/animationjs/player_animation/waving.json from mods/animationjs-1.20.1-0.1.2.jar.
```

Observed output:

```json
{
  "first": {
    "matched": true,
    "mode": "read",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "entry": {
      "relativePath": "assets/animationjs/player_animation/waving.json",
      "domain": "assets",
      "sizeBytes": 4360
    },
    "cache": {
      "centralDirectoryHit": false,
      "textFileHit": false
    }
  },
  "second": {
    "matched": true,
    "mode": "read",
    "sourceArchive": "mods/animationjs-1.20.1-0.1.2.jar",
    "entry": {
      "relativePath": "assets/animationjs/player_animation/waving.json",
      "domain": "assets",
      "sizeBytes": 4360
    },
    "cache": {
      "centralDirectoryHit": true,
      "textFileHit": true
    }
  },
  "cacheSize": {
    "centralDirectories": 1,
    "textFiles": 1
  }
}
```

Interpretation:

- Repeated list operations avoid reparsing the same jar central directory.
- Repeated selected read operations avoid both reparsing central directory metadata and rereading the same small text entry.
- Cache entries are invalidated when archive size or mtime changes.

## Mod Archive Class Owner Lookup

This stage adds a focused internal lookup for crash triage and stacktrace-style requests.

Design behavior:

- Public MCP tool surface is unchanged.
- The feature is exposed as `context.query -> mod_archive_content` with payload mode `class_owner`.
- The lookup extracts Java class references from request text, filters configured platform package prefixes, and searches only `.class` entry paths in discovered mod jars.
- It reads ZIP central directory metadata only; it does not read or decompile `.class` bytecode.
- If no class owner is found, the executor falls back to the existing token-budgeted mod archive search path.

Key implementation files:

- `packages/jar-source-adapter/src/class-owner.ts`
- `packages/jar-source-adapter/src/class-owner.test.ts`
- `apps/mcp-server/src/mod-archive-content-executor.ts`
- `apps/mcp-server/src/mod-archive-content-executor.test.ts`

### TDD Evidence

Adapter RED:

```text
FAIL  packages/jar-source-adapter/src/class-owner.test.ts
Error: Cannot find module './class-owner.js'
```

Executor RED:

```text
FAIL  apps/mcp-server/src/mod-archive-content-executor.test.ts > locates the owning mod jar for stacktrace class references
expected ordinary mod_archive_content search output to include mode "class_owner"
```

GREEN targeted tests:

```text
packages/jar-source-adapter/src/class-owner.test.ts
Test Files  1 passed (1)
Tests  2 passed (2)

apps/mcp-server/src/mod-archive-content-executor.test.ts
Test Files  1 passed (1)
Tests  4 passed (4)
```

Package test:

```text
pnpm --dir packages/jar-source-adapter test

Test Files  4 passed (4)
Tests  9 passed (9)
```

### LostCivilization Class Owner Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script building MCP bootstrap/request/evidence plan for LostCivilization, then executing candidate-2-mod_archive_content with a stacktrace class>'
```

Request text:

```text
Crash stacktrace:
    at net.liopyu.animationjs.events.PlayerRenderer.render(PlayerRenderer.java:42)
```

Observed output:

```json
{
  "routeSteps": [
    "log_files",
    "mod_archive_content",
    "workspace_source",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "pathHintCount": 17
  },
  "result": {
    "matched": true,
    "summary": "Located 1 class owner match(es) in mod archives.",
    "payload": {
      "source": "mod_archive_content",
      "mode": "class_owner",
      "requestedClasses": [
        "net.liopyu.animationjs.events.PlayerRenderer"
      ],
      "matches": [
        {
          "sourceArchive": "/Users/gedwen/Library/Application Support/PrismLauncher/instances/LostCivilization/minecraft/mods/animationjs-1.20.1-0.1.2.jar",
          "requestedClassName": "net.liopyu.animationjs.events.PlayerRenderer",
          "binaryName": "net.liopyu.animationjs.events.PlayerRenderer",
          "relativePath": "net/liopyu/animationjs/events/PlayerRenderer.class",
          "sizeBytes": 8773,
          "matchKind": "exact"
        }
      ],
      "searchedArchives": 64,
      "cache": {
        "centralDirectoryHits": 0,
        "centralDirectoryMisses": 64
      },
      "truncated": false
    }
  }
}
```

Interpretation:

- The harness chose the intended crash route: logs first, then mod archive content, then workspace source, then docs.
- The mod jar owner was found from a real installed modpack jar.
- The lookup avoided source guessing and bytecode reading, so it is suitable as a cheap first pass for crash triage.

### Final Verification After Class Owner Lookup

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
Test Files  58 passed (58)
Tests  196 passed (196)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest current source/test files:

```text
455 packages/kubejs-types-adapter/src/summary.test.ts
445 apps/mcp-server/testdata/on-demand-vanilla-source.ts
442 apps/mcp-server/src/request-handler.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
427 packages/kubejs-types-adapter/src/semantic-extractors.ts
407 apps/mcp-server/src/probejs-types-executor.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
```

## mc-developing-mcp Branch Import Verification

This stage stores the current `SKillUpdate` TypeScript MCP project as a dedicated branch in the original `mc-developing-mcp` repository.

Branch/worktree:

```text
Repository: /Users/gedwen/Documents/programing/MCProgrammingSkill/Mc-Skill
Branch: skill-update
Temporary worktree: /tmp/mc-developing-mcp-skill-update
Source copied from: /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
```

Import behavior:

- `Mc-Skill/main` was not switched or overwritten.
- The branch root contains the TypeScript MCP workspace directly.
- The old Python MCP tree, generated SQLite docs, bundled workspace reference chunks, and Python tests are removed on this branch only.
- `node_modules`, `dist`, coverage output, `.DS_Store`, `tmp`, and TypeScript build info are ignored.

Clean checkout fix:

- Root `pnpm test` now runs `tsc -b && vitest run`.
- Root `tsconfig.json` references are ordered so a clean branch checkout can build workspace packages before tests resolve package exports.

Final branch verification:

```text
pnpm install --frozen-lockfile: exit code 0
pnpm test: Test Files 64 passed (64), Tests 208 passed (208)
pnpm typecheck: exit code 0
Go residual check: no output
500-line check: no output
```

## Gradle Declared Dependency Prioritization

This stage makes Gradle sources lookup use workspace-declared dependencies before broader package/path heuristics.

Reason:

- A local Gradle cache may contain many unrelated source jars.
- Package-name heuristics can be wrong when a library exposes packages that do not match its Maven group/artifact.
- The workspace build file is stronger evidence than local cache ordering.

Design behavior:

- `packages/gradle-adapter/src/build-dependencies.ts` reads root `build.gradle` and `build.gradle.kts`.
- It extracts common string and named-argument dependency notations such as:
  - `implementation "org.widgets:widget-api:1.0.0"`
  - `modImplementation("com.example:example-lib:2.0.0")`
  - `api(group = "net.minecraftforge", name = "eventbus", version = "6.2.33")`
- `gradle-source-archive-lookup.ts` scores exact declared `group:artifact:version` source jars above package-name guesses.
- Public MCP tool surface is unchanged.

Key implementation files:

- `packages/gradle-adapter/src/build-dependencies.ts`
- `packages/gradle-adapter/src/build-dependencies.test.ts`
- `packages/gradle-adapter/src/index.ts`
- `apps/mcp-server/src/gradle-source-archive-lookup.ts`
- `apps/mcp-server/src/gradle-source-archive-lookup.test.ts`

### TDD Evidence

RED:

```text
FAIL  apps/mcp-server/src/gradle-source-archive-lookup.test.ts > prioritizes sources jars for dependencies declared by the workspace
expected searchedArchives: 1, received searchedArchives: 2
```

GREEN targeted tests:

```text
packages/gradle-adapter
Test Files  2 passed (2)
Tests  4 passed (4)

apps/mcp-server/src/gradle-source-archive-lookup.test.ts
Test Files  1 passed (1)
Tests  3 passed (3)

apps/mcp-server/src/source-bundle-executor.test.ts + packages/gradle-adapter/src/build-dependencies.test.ts
Test Files  2 passed (2)
Tests  7 passed (7)
```

### Real Gradle Cache Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script creating a temporary Gradle workspace declaring net.minecraftforge:eventbus:6.2.33, then executing source.bundle for net.minecraftforge.eventbus.api.Event>'
```

Temporary `build.gradle`:

```groovy
dependencies { implementation "net.minecraftforge:eventbus:6.2.33" }
```

Observed output:

```json
{
  "routeSteps": [
    "workspace_source",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "provenance": "workspace_source"
  },
  "matched": true,
  "summary": "Resolved net.minecraftforge.eventbus.api.Event from a Gradle sources archive.",
  "payload": {
    "source": "gradle_source_archive",
    "request": {
      "symbol": "net.minecraftforge.eventbus.api.Event",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java"
    },
    "status": "ready",
    "searchedArchives": 1,
    "firstReference": {
      "sourceArchive": "/Users/gedwen/.gradle/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.2.33/296aff9f6e6298e17e19ace4bd8b02c45d823530/eventbus-6.2.33-sources.jar",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java",
      "contentSample": "/*\\n * Copyright (c) Forge Development LLC\\n * SPDX-License-Identifier: LGPL-2.1-only\\n */\\npackage net.minecraftforge.event"
    },
    "skippedCount": 0
  }
}
```

Interpretation:

- The lookup selected the version declared in the workspace, not the first matching local cache entry.
- The exact source was returned after checking one sources jar.
- This is closer to IDE behavior: prefer the project model, then use cache/search heuristics as fallback.

### Final Verification After Declared Dependency Prioritization

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/gradle-adapter test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
packages/gradle-adapter: Test Files 2 passed, Tests 4 passed
apps/mcp-server: Test Files 14 passed, Tests 43 passed
workspace: Test Files 60 passed (60), Tests 201 passed (201)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest current source/test files remain under 500 lines:

```text
455 packages/kubejs-types-adapter/src/summary.test.ts
445 apps/mcp-server/testdata/on-demand-vanilla-source.ts
443 apps/mcp-server/src/source-bundle-executor.test.ts
442 apps/mcp-server/src/request-handler.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
427 packages/kubejs-types-adapter/src/semantic-extractors.ts
407 apps/mcp-server/src/probejs-types-executor.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
```

## Declared Dependency Direct Sources Path

This stage adds a fast path before broad Gradle cache scanning.

Reason:

- Once a workspace declares `group:artifact:version`, the Gradle cache location is predictable:
  `caches/modules-2/files-2.1/<group>/<artifact>/<version>/<hash>/<artifact>-<version>-sources.jar`.
- The MCP should not spend time scanning broad local caches when exact project model evidence exists.
- This also gives clearer provenance in returned evidence.

Design behavior:

- `discoverDeclaredDependencySourceArchives()` reads already parsed Gradle dependencies and directly checks exact Gradle cache paths.
- `gradle-source-archive-lookup.ts` now tries declared dependency source archives before broad scanning.
- The declared fast path is not disabled by broad scan budgets such as `maxResults: 0`.
- If no direct declared dependency source archive matches the requested file, the old ranked broad scan fallback still runs.
- Public MCP tool surface is unchanged.

Key implementation files:

- `packages/gradle-adapter/src/dependency-source-archives.ts`
- `packages/gradle-adapter/src/dependency-source-archives.test.ts`
- `packages/gradle-adapter/src/index.ts`
- `packages/gradle-adapter/package.json`
- `apps/mcp-server/src/gradle-source-archive-lookup.ts`
- `apps/mcp-server/src/gradle-source-archive-lookup.test.ts`

### TDD Evidence

RED:

```text
FAIL  packages/gradle-adapter/src/dependency-source-archives.test.ts
Error: Cannot find module './dependency-source-archives.js'
```

Lookup RED before fast path integration:

```text
FAIL  apps/mcp-server/src/gradle-source-archive-lookup.test.ts > uses declared dependency source archives before broad cache scanning
expected searchedArchives: 1, received undefined
```

GREEN targeted tests:

```text
packages/gradle-adapter/src/dependency-source-archives.test.ts
Test Files  1 passed (1)
Tests  1 passed (1)

apps/mcp-server/src/gradle-source-archive-lookup.test.ts + packages/gradle-adapter/src/dependency-source-archives.test.ts
Test Files  2 passed (2)
Tests  6 passed (6)
```

### Real Direct Path Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script creating a temporary Gradle workspace declaring net.minecraftforge:eventbus:6.2.33, then executing source.bundle with broad scan maxResults/maxVisitedEntries set to 0>'
```

Temporary `build.gradle`:

```groovy
dependencies { implementation "net.minecraftforge:eventbus:6.2.33" }
```

Observed output:

```json
{
  "routeSteps": [
    "workspace_source",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "provenance": "workspace_source"
  },
  "matched": true,
  "summary": "Resolved net.minecraftforge.eventbus.api.Event from a Gradle sources archive.",
  "payload": {
    "source": "gradle_source_archive",
    "request": {
      "symbol": "net.minecraftforge.eventbus.api.Event",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java"
    },
    "status": "ready",
    "searchedArchives": 1,
    "firstReference": {
      "sourceArchive": "/Users/gedwen/.gradle/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.2.33/296aff9f6e6298e17e19ace4bd8b02c45d823530/eventbus-6.2.33-sources.jar",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java",
      "reason": "declared Gradle dependency net.minecraftforge:eventbus:6.2.33 in build.gradle",
      "contentSample": "/*\\n * Copyright (c) Forge Development LLC\\n * SPDX-License-Identifier: LGPL-2.1-only\\n */\\npackage net.minecraftforge.event"
    },
    "skippedCount": 0
  }
}
```

Interpretation:

- The exact source was resolved even with broad cache scanning disabled.
- The returned provenance now explicitly says the source came from a declared Gradle dependency.
- This is closer to IDE behavior: project model first, broad cache search only as fallback.

### Final Verification After Direct Sources Path

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/gradle-adapter test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
packages/gradle-adapter: Test Files 3 passed, Tests 6 passed
apps/mcp-server: Test Files 14 passed, Tests 45 passed
workspace: Test Files 61 passed (61), Tests 205 passed (205)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest current source/test files remain under 500 lines:

```text
455 packages/kubejs-types-adapter/src/summary.test.ts
445 apps/mcp-server/testdata/on-demand-vanilla-source.ts
443 apps/mcp-server/src/source-bundle-executor.test.ts
442 apps/mcp-server/src/request-handler.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
427 packages/kubejs-types-adapter/src/semantic-extractors.ts
407 apps/mcp-server/src/probejs-types-executor.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
```

## Declared Dependency Binary Archive Fallback

This stage adds a fallback after Gradle sources lookup.

Reason:

- Some Gradle dependencies and mod libraries do not ship a `*-sources.jar`.
- Even without source, crash triage still needs exact evidence about which dependency jar owns a stacktrace class.
- The fallback should be cheap and safe: inspect jar central-directory `.class` paths only, do not read bytecode and do not decompile.

Design behavior:

- Public MCP tool surface is unchanged.
- `source.bundle -> workspace_source` still tries Gradle sources first.
- If no sources result is available, it searches declared Gradle binary dependency jars for requested Java class owners.
- It uses build-file and version-catalog dependency evidence before cache scanning.
- It returns owner evidence under `payload.source = "gradle_dependency_archive"`.

Key implementation files:

- `packages/gradle-adapter/src/dependency-binary-archives.ts`
- `packages/gradle-adapter/src/dependency-binary-archives.test.ts`
- `apps/mcp-server/src/gradle-dependency-archive-lookup.ts`
- `apps/mcp-server/src/gradle-dependency-archive-lookup.test.ts`
- `apps/mcp-server/src/source-bundle-executor.ts`
- `apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts`

### TDD Evidence

Adapter RED:

```text
FAIL  packages/gradle-adapter/src/dependency-binary-archives.test.ts
Error: Cannot find module './dependency-binary-archives.js'
```

Executor RED before wiring:

```text
FAIL  apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts
expected { matched: false } to match object { matched: true, payload: { source: "gradle_dependency_archive" } }
```

GREEN targeted tests:

```text
apps/mcp-server/src/source-bundle-gradle-binary-executor.test.ts
Test Files  1 passed (1)
Tests  1 passed (1)

packages/gradle-adapter
Test Files  4 passed (4)
Tests  7 passed (7)

apps/mcp-server
Test Files  16 passed (16)
Tests  47 passed (47)
```

### Real Gradle Binary Lookup Smoke

Command:

```sh
pnpm exec tsx --eval '<script creating a temporary Gradle workspace declaring net.minecraftforge:eventbus:6.2.33, then calling resolveGradleDependencyArchiveLookup against /Users/gedwen/.gradle>'
```

Temporary `build.gradle`:

```groovy
dependencies { implementation "net.minecraftforge:eventbus:6.2.33" }
```

Observed output:

```json
{
  "status": "ready",
  "requestedClasses": [
    "net.minecraftforge.eventbus.api.Event"
  ],
  "searchedArchives": 1,
  "matches": [
    {
      "sourceArchive": "/Users/gedwen/.gradle/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.2.33/3fae69cfa9c5095bcc25c0a8a3ed9b26c156f922/eventbus-6.2.33.jar",
      "requestedClassName": "net.minecraftforge.eventbus.api.Event",
      "binaryName": "net.minecraftforge.eventbus.api.Event",
      "relativePath": "net/minecraftforge/eventbus/api/Event.class",
      "sizeBytes": 3914,
      "matchKind": "exact"
    }
  ],
  "archiveCount": 1
}
```

### Source Bundle Binary Fallback Smoke

Command:

```sh
pnpm exec tsx --eval '<script copying the real eventbus-6.2.33.jar into a temporary Gradle cache without a sources jar, then executing source.bundle for a stacktrace class>'
```

Observed output:

```json
{
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "provenance": "workspace_source",
    "preferredTool": "source.bundle"
  },
  "result": {
    "matched": true,
    "summary": "Located 1 class owner match(es) from Gradle dependency archives.",
    "payload": {
      "source": "gradle_dependency_archive",
      "result": {
        "status": "ready",
        "requestedClasses": [
          "net.minecraftforge.eventbus.api.Event"
        ],
        "searchedArchives": 1,
        "matches": [
          {
            "sourceArchive": "<temp-gradle-home>/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.2.33/3fae69cfa9c5095bcc25c0a8a3ed9b26c156f922/eventbus-6.2.33.jar",
            "requestedClassName": "net.minecraftforge.eventbus.api.Event",
            "binaryName": "net.minecraftforge.eventbus.api.Event",
            "relativePath": "net/minecraftforge/eventbus/api/Event.class",
            "sizeBytes": 3914,
            "matchKind": "exact"
          }
        ],
        "archiveCount": 1
      }
    }
  }
}
```

Interpretation:

- The full `source.bundle` executor now falls back to exact declared dependency binary jars when sources are not available.
- The returned evidence identifies the owner jar and class path without consuming tokens on bytecode or decompiled content.
- Broad cache scanning was disabled in the executor smoke; the match came from the declared dependency direct Gradle cache path.

### Final Verification After Binary Fallback

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/gradle-adapter test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
packages/gradle-adapter: Test Files 4 passed, Tests 7 passed
apps/mcp-server: Test Files 16 passed, Tests 47 passed
workspace: Test Files 64 passed (64), Tests 208 passed (208)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest current source/test files remain under 500 lines:

```text
455 packages/kubejs-types-adapter/src/summary.test.ts
445 apps/mcp-server/testdata/on-demand-vanilla-source.ts
443 apps/mcp-server/src/source-bundle-executor.test.ts
442 apps/mcp-server/src/request-handler.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
427 packages/kubejs-types-adapter/src/semantic-extractors.ts
407 apps/mcp-server/src/probejs-types-executor.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
406 apps/mcp-server/src/probejs-types-executor.test.ts
```

## Gradle Version Catalog Dependency Prioritization

This stage extends Gradle declared dependency detection to version catalogs.

Reason:

- Modern Gradle and NeoForge projects often use `libs.versions.toml` rather than raw Maven coordinates in `build.gradle` or `build.gradle.kts`.
- Without catalog support, a request like `implementation(libs.forge.eventbus)` would not contribute to sources-jar ranking.
- The result would fall back to local cache heuristics and could pick an older or unrelated sources jar.

Design behavior:

- `readGradleDeclaredDependencies()` now reads `gradle/libs.versions.toml` when present.
- It resolves common catalog aliases such as `libs.forge.eventbus` to `[libraries] forge-eventbus`.
- It supports `module = "group:artifact"` plus `version.ref = "..."`.
- It supports string catalog notation such as `foo = "group:artifact:version"` and named `group`/`name` object notation.
- Gradle sources lookup uses the resolved catalog coordinate with the same priority as direct build-file dependencies.
- Public MCP tool surface is unchanged.

Key implementation files:

- `packages/gradle-adapter/src/build-dependencies.ts`
- `packages/gradle-adapter/src/build-dependencies.test.ts`
- `apps/mcp-server/src/gradle-source-archive-lookup.test.ts`

### TDD Evidence

RED:

```text
FAIL  packages/gradle-adapter/src/build-dependencies.test.ts > resolves version catalog aliases used by Gradle build files
expected [] to contain net.minecraftforge:eventbus:6.2.33
```

Lookup-level regression RED before rebuilding the adapter dist:

```text
FAIL  apps/mcp-server/src/gradle-source-archive-lookup.test.ts > prioritizes sources jars declared through version catalog aliases
expected searchedArchives: 1, received searchedArchives: 2
```

GREEN targeted tests:

```text
packages/gradle-adapter/src/build-dependencies.test.ts
Test Files  1 passed (1)
Tests  3 passed (3)

apps/mcp-server/src/gradle-source-archive-lookup.test.ts + packages/gradle-adapter/src/build-dependencies.test.ts
Test Files  2 passed (2)
Tests  7 passed (7)
```

### Real Gradle Catalog Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script creating a temporary Gradle workspace with build.gradle.kts + gradle/libs.versions.toml, then executing source.bundle for net.minecraftforge.eventbus.api.Event>'
```

Temporary `build.gradle.kts`:

```kotlin
dependencies { implementation(libs.forge.eventbus) }
```

Temporary `gradle/libs.versions.toml`:

```toml
[versions]
forgeEventbus = "6.2.33"

[libraries]
forge-eventbus = { module = "net.minecraftforge:eventbus", version.ref = "forgeEventbus" }
```

Observed output:

```json
{
  "routeSteps": [
    "workspace_source",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "provenance": "workspace_source"
  },
  "matched": true,
  "summary": "Resolved net.minecraftforge.eventbus.api.Event from a Gradle sources archive.",
  "payload": {
    "source": "gradle_source_archive",
    "request": {
      "symbol": "net.minecraftforge.eventbus.api.Event",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java"
    },
    "status": "ready",
    "searchedArchives": 1,
    "firstReference": {
      "sourceArchive": "/Users/gedwen/.gradle/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.2.33/296aff9f6e6298e17e19ace4bd8b02c45d823530/eventbus-6.2.33-sources.jar",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java",
      "contentSample": "/*\\n * Copyright (c) Forge Development LLC\\n * SPDX-License-Identifier: LGPL-2.1-only\\n */\\npackage net.minecraftforge.event"
    },
    "skippedCount": 0
  }
}
```

Interpretation:

- The MCP can now use Gradle version catalog aliases as project-model evidence.
- The lookup selected the exact declared `6.2.33` sources jar.
- It still checked only one sources jar.

### Final Verification After Version Catalog Support

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/gradle-adapter test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
packages/gradle-adapter: Test Files 2 passed, Tests 5 passed
apps/mcp-server: Test Files 14 passed, Tests 44 passed
workspace: Test Files 60 passed (60), Tests 203 passed (203)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest current source/test files remain under 500 lines:

```text
455 packages/kubejs-types-adapter/src/summary.test.ts
445 apps/mcp-server/testdata/on-demand-vanilla-source.ts
443 apps/mcp-server/src/source-bundle-executor.test.ts
442 apps/mcp-server/src/request-handler.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
427 packages/kubejs-types-adapter/src/semantic-extractors.ts
407 apps/mcp-server/src/probejs-types-executor.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
```

## Gradle Sources Jar External Class Lookup

This stage extends `source.bundle` beyond vanilla source packs.

Design behavior:

- Public MCP tool surface is unchanged.
- `workspace_source` requests that do not target `net.minecraft.*` now try a Gradle sources jar lookup before returning unmatched.
- The request parser extracts a Java class symbol or `.java` path and derives the exact source path.
- The executor discovers Gradle sources jars through the existing Gradle adapter and reads only the requested `.java` entry through the jar-source adapter.
- Candidate sources jars are ranked by requested package/group hints before reading, so likely matches are tried first.
- Vanilla source acquisition still uses the explicit-confirmation source package path.

Key implementation files:

- `apps/mcp-server/src/source-bundle-executor.ts`
- `apps/mcp-server/src/source-bundle-executor.test.ts`

### TDD Evidence

Initial RED:

```text
FAIL  apps/mcp-server/src/source-bundle-executor.test.ts > reads a non-vanilla Java class from a Gradle sources jar
expected matched true gradle_source_archive payload, received matched false
```

Performance/telemetry RED:

```text
FAIL  apps/mcp-server/src/source-bundle-executor.test.ts > reads a non-vanilla Java class from a Gradle sources jar
expected searchedArchives: 1, received searchedArchives: 2
```

GREEN targeted test:

```text
apps/mcp-server/src/source-bundle-executor.test.ts
Test Files  1 passed (1)
Tests  5 passed (5)
```

### LostCivilization Gradle Sources Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script building MCP bootstrap/request/evidence plan for LostCivilization, then executing source.bundle for net.minecraftforge.eventbus.api.Event>'
```

Request text:

```text
Inspect net.minecraftforge.eventbus.api.Event from Gradle sources before guessing.
```

Observed output:

```json
{
  "routeSteps": [
    "workspace_source",
    "mod_archive_content",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "provenance": "workspace_source"
  },
  "matched": true,
  "summary": "Resolved net.minecraftforge.eventbus.api.Event from a Gradle sources archive.",
  "payload": {
    "source": "gradle_source_archive",
    "request": {
      "symbol": "net.minecraftforge.eventbus.api.Event",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java"
    },
    "status": "ready",
    "searchedArchives": 1,
    "firstReference": {
      "sourceArchive": "/Users/gedwen/.gradle/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.0.3/daa1254e3b62f3ca68d1a741d3ed9869fab1e751/eventbus-6.0.3-sources.jar",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java",
      "contentSample": "/*\\n * Minecraft Forge\\n * Copyright (c) 2016.\\n *\\n * This library is free software; you can redistribute it and/or\\n * modi"
    },
    "skippedCount": 0
  }
}
```

Interpretation:

- The MCP can now fetch exact external library/modding API source from local Gradle caches without installing or packaging it first.
- The lookup returned source evidence before docs and before broad jar archive search.
- Package-aware ranking reduced this smoke from 132 checked sources jars to 1 checked sources jar.

### Final Verification After Gradle Sources Lookup

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
Test Files  58 passed (58)
Tests  196 passed (196)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest touched files remain under the 500-line source/test limit:

```text
443 apps/mcp-server/src/source-bundle-executor.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
389 apps/mcp-server/src/source-bundle-executor.ts
```

## Gradle Sources Lookup Module Split

This stage keeps the Gradle sources behavior but moves the detailed lookup logic out of `source-bundle-executor.ts`.

Reason:

- `source-bundle-executor.ts` was growing toward the 500-line limit.
- Gradle sources lookup has separate responsibilities: request parsing, source jar discovery, package-aware ranking, nested-class source path derivation, and exact jar entry reads.
- Keeping it separate makes later Gradle/LSP integration easier to maintain.

Design behavior:

- Public MCP tool surface is unchanged.
- `source-bundle-executor.ts` remains the route/payload wrapper.
- `gradle-source-archive-lookup.ts` owns Gradle sources jar lookup internals.
- Nested crash classes such as `com.example.lib.Widget$Nested` map to `com/example/lib/Widget.java`.
- Package-aware ranking remains covered by focused module tests.

Key implementation files:

- `apps/mcp-server/src/gradle-source-archive-lookup.ts`
- `apps/mcp-server/src/gradle-source-archive-lookup.test.ts`
- `apps/mcp-server/src/source-bundle-executor.ts`
- `apps/mcp-server/package.json`

### TDD Evidence

RED:

```text
FAIL  apps/mcp-server/src/gradle-source-archive-lookup.test.ts
Error: Cannot find module './gradle-source-archive-lookup.js'
```

GREEN targeted tests:

```text
apps/mcp-server/src/gradle-source-archive-lookup.test.ts
Test Files  1 passed (1)
Tests  2 passed (2)

apps/mcp-server/src/source-bundle-executor.test.ts
Test Files  1 passed (1)
Tests  5 passed (5)
```

Package test:

```text
pnpm --dir apps/mcp-server test

Test Files  14 passed (14)
Tests  42 passed (42)
```

### LostCivilization Regression Smoke

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx --eval '<script building MCP bootstrap/request/evidence plan for LostCivilization, then executing source.bundle for net.minecraftforge.eventbus.api.Event>'
```

Observed output after the module split:

```json
{
  "routeSteps": [
    "workspace_source",
    "mod_archive_content",
    "docs_lookup"
  ],
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "provenance": "workspace_source"
  },
  "matched": true,
  "summary": "Resolved net.minecraftforge.eventbus.api.Event from a Gradle sources archive.",
  "payload": {
    "source": "gradle_source_archive",
    "request": {
      "symbol": "net.minecraftforge.eventbus.api.Event",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java"
    },
    "status": "ready",
    "searchedArchives": 1,
    "firstReference": {
      "sourceArchive": "/Users/gedwen/.gradle/caches/modules-2/files-2.1/net.minecraftforge/eventbus/6.0.3/daa1254e3b62f3ca68d1a741d3ed9869fab1e751/eventbus-6.0.3-sources.jar",
      "relativePath": "net/minecraftforge/eventbus/api/Event.java",
      "contentSample": "/*\\n * Minecraft Forge\\n * Copyright (c) 2016.\\n *\\n * This library is free software; you can redistribute it and/or\\n * modi"
    },
    "skippedCount": 0
  }
}
```

### Final Verification After Module Split

Commands:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find apps packages tests -type f \( -name '*.ts' -o -name '*.test.ts' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text
Test Files  59 passed (59)
Tests  198 passed (198)

typecheck exit code: 0
Go residual check: no output
500-line check: no output
```

Largest current source/test files:

```text
455 packages/kubejs-types-adapter/src/summary.test.ts
445 apps/mcp-server/testdata/on-demand-vanilla-source.ts
443 apps/mcp-server/src/source-bundle-executor.test.ts
442 apps/mcp-server/src/request-handler.test.ts
435 packages/jar-source-adapter/src/archive-content.ts
427 packages/kubejs-types-adapter/src/semantic-extractors.ts
407 apps/mcp-server/src/probejs-types-executor.ts
407 apps/mcp-server/src/mod-archive-content-executor.ts
```
