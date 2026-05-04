# Client Visual API Proof Verification

Date: 2026-05-05 07:12:06 AEST

## Scope

This verification covers the client visual API proof slice:

- Build compact loader/version API proof from client visual source evidence.
- Attach proof to `source.bundle` `clientVisualEvidence`.
- Require implementation skeletons to treat loader/version API proof as part of the implementation chain.
- Keep the public MCP tool surface unchanged.

## Focused Test Output

Command:

```bash
pnpm exec vitest run --root . apps/mcp-server/src/client-visual-api-proof.test.ts apps/mcp-server/src/source-bundle-client-visual-evidence.test.ts apps/mcp-server/src/mc-develop-client-visual-harness-eval.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests       7 passed (7)
```

## Verified Behavior

- `buildClientVisualApiProof` summarizes renderer, screen, model, reload, dynamic texture, network, client init, and KubeJS API surfaces.
- Forge runtime plus Fabric-only evidence reports loader surface mismatch risks.
- Unknown loader/version produces missing API proof risks instead of assuming a loader.
- `source.bundle` client visual evidence now returns `clientVisualEvidence.apiProof`.
- `implementationSkeleton.evidenceBackedSteps` includes `loader_version_api_proof` only when loader, Minecraft version, and mismatch risk checks are clean.
- Harness guidance tells agents to use `clientVisualEvidence.apiProof` before naming loader-specific APIs.

## Residual Risk

The proof classifier is symbol-based and intentionally compact. Shared Forge/NeoForge/common symbols are not treated as full loader proof by themselves; higher-confidence proof should later incorporate imports, source archives, LSP/source-index evidence, or versioned docs.
