# Agentic Bottom-Layer Services Verification
Date: 2026-04-26
Author: m1hono
Scope: `SKillUpdate` TypeScript bottom-layer services

## Verification Commands
```bash
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/source-package-manager exec tsx testdata/source-package-product.ts
```

## Test Results
- `vitest`: 40 test files passed, 126 tests passed.
- `typecheck`: `tsc -b --pretty false` passed.
- No `.go`, `go.mod`, or `go.sum` files found outside `node_modules`.
- Largest source/test file after this slice is under the 500-line hard limit.

## Real Return Values
### Source Package Manager
`source-package-product.ts` returned the expected state transitions:

```json
{
  "beforeConfirmation": {
    "status": "needs_confirmation",
    "confirmationScope": "package-version"
  },
  "firstInstall": {
    "status": "ready",
    "summary": "Executed 3 recipe step(s) for minecraft-1.20.1-source-pack-named."
  },
  "secondEnsure": {
    "status": "ready",
    "summary": "Source package minecraft-1.20.1-source-pack-named is already installed."
  }
}
```

Installed product now includes SQLite:

```json
{
  "files": [
    "net/minecraft/world/item/ItemStack.java",
    "source-index.sqlite",
    "source-package.manifest.json"
  ],
  "manifest": {
    "stepKinds": [
      "extract_java_sources_zip",
      "build_source_index",
      "write_package_manifest"
    ],
    "fileCount": 1
  }
}
```

### SQLite Source Index
Direct source-index build/query returned:

```json
{
  "build": {
    "fileCount": 2,
    "skippedFileCount": 0,
    "indexedTextFileCount": 2,
    "javaSymbolCount": 1
  },
  "symbol": {
    "matches": [
      {
        "path": "net/minecraft/world/item/ItemStack.java",
        "kind": "java",
        "packageName": "net.minecraft.world.item",
        "simpleName": "ItemStack",
        "qualifiedName": "net.minecraft.world.item.ItemStack"
      }
    ]
  },
  "text": {
    "matches": [
      {
        "path": "data/demo/recipes/stone.json",
        "kind": "json"
      }
    ]
  }
}
```

### ProbeJS And Datapack Adapters
ProbeJS fixture returned:

```json
{
  "summary": {
    "rootCount": 1,
    "fileCount": 2,
    "bySourceKind": {
      "dts": 1,
      "snippet": 1
    },
    "truncated": false
  },
  "search": {
    "query": "minecraft:stone",
    "matches": [
      {
        "relativePath": "kubejs/probejs/snippets/items.json",
        "lineNumber": 1
      }
    ]
  }
}
```

Datapack/assets fixture returned:

```json
{
  "discovery": {
    "namespaces": ["demo"],
    "dataKinds": ["recipes"],
    "assetKinds": ["lang"]
  },
  "search": {
    "matches": [
      {
        "relativePath": "data/demo/recipes/stone.json",
        "kind": "recipes",
        "domain": "data"
      }
    ],
    "truncated": false
  }
}
```

### Jar Content Extraction
Mod jar extraction returned:

```json
{
  "fileCount": 3,
  "byDomain": {
    "java": 1,
    "data": 1,
    "assets": 1
  },
  "extractedPreview": {
    "recipe": "{\"result\":\"minecraft:stone\"}\\n",
    "lang": "{\"item.demo.foo\":\"Foo\"}\\n"
  }
}
```

### Service Profile And Prompt Injection
Service profile returned:

```json
{
  "workspaceKind": "modpack",
  "runtime": {
    "minecraftVersion": "1.20.1",
    "loader": "neoforge",
    "confidence": "high"
  },
  "capabilities": {
    "gradle": {
      "status": "ready",
      "sourceArchiveCount": 1
    },
    "javaLsp": {
      "status": "ready",
      "supportedOperations": [
        "definition",
        "references",
        "hover",
        "workspaceSymbol",
        "diagnostics"
      ]
    },
    "kubejsTypes": {
      "status": "ready",
      "fileCount": 1
    },
    "datapack": {
      "status": "ready",
      "namespaces": ["demo"]
    },
    "sourceIndex": {
      "status": "ready",
      "databaseCount": 1
    }
  }
}
```

Injected prompt excerpt:

```text
Workspace kind: modpack
Runtime: 1.20.1 / neoforge
Gradle: ready, source archives=1
Java LSP: ready
ProbeJS types: ready, files=1
Datapack: ready, namespaces=demo
Source indexes: ready, databases=1
Guidance: Use Gradle files and discovered source archives before guessing external mod or Minecraft classes.
Guidance: Use ProbeJS/d.ts evidence before generic JavaScript assumptions for KubeJS.
Guidance: Use local SQLite source indexes as an accelerator; source files remain the authority.
```

## Remaining Gaps
- JDTLS JSON-RPC session manager is not implemented yet; current work provides profile and operation contracts.
- Remote package release/download/checksum workflow is not implemented yet.
- Full vanilla acquisition from Mojang manifests, mappings, decompile and remap is not implemented yet.
- Source-index cache eviction and memory/disk pressure policy is not implemented yet.
