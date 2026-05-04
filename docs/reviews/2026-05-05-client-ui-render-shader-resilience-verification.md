# Client UI Render Shader Resilience Verification

Date: 2026-05-05 07:25:30 AEST

## Scope

This verification covers the client visual expansion slice:

- UI layout evidence.
- Render pipeline state evidence.
- Shader/post-processing evidence.
- Nine-slice/stretchable UI asset classification.
- Version-resilient harness guidance that avoids memorized old API names.
- Optional external shader-reference provider requirements as a future internal provider, not a public MCP tool expansion.

## Focused Test Output

Command:

```bash
pnpm exec vitest run --root . packages/agent-harness/src/intent.test.ts packages/agent-harness/src/client-visual-route.test.ts packages/datapack-adapter/src/kinds.test.ts packages/jar-source-adapter/src/mod-archive-asset-kind.test.ts apps/mcp-server/src/client-visual-source-scanner.test.ts apps/mcp-server/src/client-visual-api-proof.test.ts apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts apps/mcp-server/src/mc-develop-client-visual-harness-eval.test.ts
```

Result:

```text
Test Files  8 passed (8)
Tests       30 passed (30)
```

## Verified Behavior

- Client visual intent detects nine-slice, shader/post-processing, and render-pipeline requests.
- Source scanning records `uiLayoutHints`, `renderPipelineHints`, and `shaderPipelineHints`.
- API proof exposes `ui`, `renderPipeline`, and `shader` surfaces.
- `source.bundle` client visual evidence returns those surfaces in `clientVisualEvidence`.
- Implementation skeletons separate `ui_layout`, `render_pipeline_state`, and `shader_or_post_chain`.
- Resource-pack and mod-archive asset classifiers identify nine-slice metadata paths.
- Harness policy requires role-equivalent evidence for major client API changes.

## Residual Risk

External shader-reference retrieval is specified but not implemented in this slice. It should be added as an internal credential-gated provider behind existing progressive evidence routes, returning `credentials_required` when no user API key is configured.
