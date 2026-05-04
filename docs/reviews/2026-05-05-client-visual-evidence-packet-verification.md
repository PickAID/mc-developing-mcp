# Client Visual Evidence Packet Verification

Date: 2026-05-05

## Scope

This slice adds structured client visual evidence behind existing internal routes:

- `client_visual_resources` keeps using `datapack_files`, but its evidence provenance is now `resource_pack_files`.
- `source.bundle` now returns `clientVisualEvidence` for visual resource requests.
- Client visual evidence now includes bounded source scan counts for registry declarations, client init, renderer bindings, screen/menu registrations, model layer hints, resource-location references, and KubeJS client hooks.
- Source scan v1 includes dynamic texture, resource reload, network sync, animation state, and render performance risk hints.
- `clientVisualEvidence` includes a compact deterministic `implementationSkeleton`, so tests can assert implementation-chain guidance instead of only evidence discovery.
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
      "candidateRegistries": 1,
      "candidateClientInit": 1,
      "candidateRendererBindings": 1,
      "candidateScreenRegistrations": 1,
      "candidateModelLayerRegistrations": 1,
      "resourceLocationReferences": 1,
      "dynamicTextureHints": 1,
      "resourceReloadHooks": 1,
      "networkSyncHints": 1,
      "animationStateHints": 1,
      "renderPerformanceRisks": 1,
      "scannedFiles": 2,
      "truncated": false,
      "evidence": [
        {
          "kind": "candidateRendererBindings",
          "file": "src/main/java/demo/ClientInit.java",
          "line": 4,
          "language": "java",
          "symbol": "BlockEntityRenderers.register"
        }
      ]
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
    "implementationSkeleton": {
      "tokenPolicy": "compact_client_visual_implementation_skeleton",
      "chain": [
        "registry_id",
        "server_state_or_menu",
        "client_init",
        "renderer_or_screen_binding",
        "asset_chain",
        "sync_or_reload_boundary"
      ],
      "requiredSteps": [
        "confirm registry id",
        "choose static JSON model vs runtime renderer/model loader",
        "verify blockstate -> model -> texture chain",
        "bind renderer or screen from client-only initialization",
        "keep authoritative state server-side",
        "use interpolation for animated state",
        "use reload/cache lifecycle for dynamic textures or generated assets"
      ],
      "evidenceBackedSteps": [
        "registry_id",
        "client_init",
        "renderer_binding",
        "asset_chain"
      ],
      "cautions": [
        "do not collapse moving parts into blockstate explosion",
        "avoid per-frame file IO, JSON parsing, registration, or texture allocation",
        "do not let screen or renderer mutate authoritative state directly"
      ]
    },
    "missingEvidence": [],
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
pnpm exec vitest run --root . apps/mcp-server/src/mc-develop-client-visual-harness-eval.test.ts apps/mcp-server/src/client-visual-source-scanner.test.ts apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts packages/agent-harness/src/client-visual-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/intent.test.ts
pnpm --filter @mcpskill/mcp-server test
wc -l apps/mcp-server/src/source-bundle-datapack.ts apps/mcp-server/src/evidence-plan.ts apps/mcp-server/src/evidence-plan-resource-pack.test.ts apps/mcp-server/src/client-visual-evidence-packet.ts apps/mcp-server/src/source-bundle-resource-location-matches.ts apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts
```

## Results

- Focused source-bundle tests: 2 files passed, 2 tests passed.
- Client visual harness eval: 6 files passed, 24 tests passed.
- `@mcpskill/mcp-server`: 66 files passed, 186 tests passed.
- Line check: `source-bundle-datapack.ts` is 489 lines; touched TS files are below 500 lines.

## Residual Risks

- `sourceEvidence` is still regex-based bounded evidence. It is useful for grounding and triage, but LSP/source-index integration is still needed before treating it as semantic proof.
- `implementationSkeleton` is deterministic guidance derived from evidence. It should guide the agent's implementation plan but does not replace loader/version API verification or code review.
