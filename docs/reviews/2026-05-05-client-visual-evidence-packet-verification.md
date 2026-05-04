# Client Visual Evidence Packet Verification

Date: 2026-05-05

## Scope

This slice adds structured client visual evidence behind existing internal routes:

- `client_visual_resources` keeps using `datapack_files`, but its evidence provenance is now `resource_pack_files`.
- `source.bundle` now returns `clientVisualEvidence` for visual resource requests.
- Resource-location metadata matching was extracted from `source-bundle-datapack.ts` to keep the file below 500 lines.

No public MCP tools were added.

## Actual Returned Shape

The tested `source.bundle` payload now includes:

```json
{
  "clientVisualEvidence": {
    "intent": "client_visual_resources",
    "workspaceEvidence": {
      "hasJavaSource": true,
      "hasKubeJS": false,
      "hasProbeJS": false,
      "hasDatapack": true,
      "hasModArchives": false,
      "hasResourcePack": true
    },
    "sourceEvidence": {
      "candidateRegistries": 0,
      "candidateClientInit": 0,
      "candidateRendererBindings": 0,
      "candidateSyncPaths": 0
    },
    "assetEvidence": {
      "namespaces": ["demo"],
      "byDomain": { "assets": 3 },
      "byKind": {
        "blockstates": 1,
        "models": 1,
        "textures": 1
      },
      "referenceTraceAvailable": false,
      "unresolvedReferenceCount": 0,
      "binaryContentReturned": false
    },
    "registryToAssetSummary": {
      "requestedResourceLocations": ["demo:block/gear"],
      "matchedAssetPaths": [
        "assets/demo/blockstates/block/gear.json",
        "assets/demo/models/block/gear.json",
        "assets/demo/textures/block/gear.png"
      ],
      "missingAssetKinds": []
    },
    "missingEvidence": [
      "source registry scan not implemented",
      "renderer binding scan not implemented"
    ],
    "nextReads": [
      "assets/demo/blockstates/block/gear.json",
      "assets/demo/models/block/gear.json"
    ]
  }
}
```

## Verification Commands

```sh
pnpm exec vitest run --root . apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts apps/mcp-server/src/source-bundle-resource-location.test.ts
pnpm --filter @mcpskill/mcp-server test
wc -l apps/mcp-server/src/source-bundle-datapack.ts apps/mcp-server/src/evidence-plan.ts apps/mcp-server/src/evidence-plan-resource-pack.test.ts apps/mcp-server/src/client-visual-evidence-packet.ts apps/mcp-server/src/source-bundle-resource-location-matches.ts apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts
```

## Results

- Focused source-bundle tests: 2 files passed, 2 tests passed.
- `@mcpskill/mcp-server`: 64 files passed, 180 tests passed.
- Line check: `source-bundle-datapack.ts` is 489 lines; touched TS files are below 500 lines.

## Residual Risks

- `sourceEvidence` is intentionally zero-count in this slice. The next implementation should add source-side registry/client-init/renderer binding scanning.
- `clientVisualEvidence` is currently asset evidence plus honest missing-source indicators; it should not be presented as complete visual correctness proof.
