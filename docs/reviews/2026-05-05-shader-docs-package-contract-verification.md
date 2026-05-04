# Shader Docs Package Contract Verification

Date: 2026-05-05 07:37:59 AEST

## Scope

This verification covers the package-contract slice:

- Docs package metadata can represent UI, rendering, shader, coremod, migration, API-proof, and format-reference packages.
- Docs selector can match client visual docs by asset, shader, API, and migration query signals.
- Source package manifests can preserve optional docs/source capability metadata.
- External shader reference lookup has an internal credential gate and does not add public MCP tools.

## Focused Test Output

Command:

```bash
pnpm exec vitest run --root . apps/mcp-server/src/external-shader-reference.test.ts packages/docs-retrieval/src/selector.test.ts packages/source-package-manager/src/manifest.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests       8 passed (8)
```

## Package Test Output

Commands:

```bash
pnpm --filter @mcpskill/mcp-server test
pnpm --filter @mcpskill/source-package-manager test
pnpm --filter @mcpskill/docs-retrieval test
```

Results:

```text
@mcpskill/mcp-server: 68 files, 193 tests passed
@mcpskill/source-package-manager: 5 files, 17 tests passed
@mcpskill/docs-retrieval: 2 files, 7 tests passed
```

## Verified Behavior

- Missing shader-reference credentials return `credentials_required` and do not call remote fetch.
- Credentialed shader-reference lookup maps remote summaries into compact Minecraft roles: uniforms, samplers, render targets, reload lifecycle, and fallback.
- Docs selector matches extended signals without adding a builtin shader docs package.
- Source package manifests preserve optional capability metadata without changing old package requirements.

## Residual Risk

The external shader reference provider is internal and not yet wired into `source.bundle` or `context.query`. It is intentionally a contract slice so the public MCP surface remains minimal while the later provider integration has tested credential behavior to reuse.
