# 2026-05-06 npm Release Preparation Verification

## Scope

Prepared the TypeScript workspace for npm upload without performing a real publish.

The release shape is a publishable package closure, not a single bundled MCP server package. `@mcpskill/mcp-server` imports internal `@mcpskill/*` runtime packages, so those runtime dependencies must be published together.

## Implemented Release Guardrails

- Added publish metadata for the runtime dependency closure: `author: "m1hono"`, repository metadata, `publishConfig.access: "public"`, and explicit `license: "UNLICENSED"`.
- Kept non-runtime workspace apps/packages private, including `apps/agent-runtime` and `packages/eval-harness`.
- Added `scripts/npm-publish-packages.mjs` as the ordered package list for future publication.
- Added `pnpm run publish:check` to verify package metadata, built entrypoints, dependency closure, and forbidden dist outputs.
- Added `pnpm run publish:dry-run` to create temporary `pnpm pack` tarballs, inspect packed `package.json`, verify no `workspace:` dependency ranges remain, then delete the tarballs.
- Added root and MCP package READMEs explaining the small public MCP surface and npm release workflow.

## Verification Commands

```sh
pnpm test
pnpm run publish:check
pnpm run publish:dry-run
find apps packages tests \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$1 > 500 && $2 != "total" { print }'
find apps/mcp-server/dist -type f \( -name '*.test.js' -o -name '*.test.d.ts' -o -name '*.test-support.js' -o -name '*.test-support.d.ts' \) | wc -l
find apps/mcp-server/dist -maxdepth 1 -type f ! -name 'index.*' ! -name 'stdio.*' | wc -l
git diff --check
```

## Results

- `pnpm test`: passed, `178` test files and `622` tests.
- `pnpm run publish:check`: passed for `19` publishable packages.
- `pnpm run publish:dry-run`: passed for all `19` publishable packages.
- Packed tarball dependency check: all packed internal dependency ranges were rewritten from `workspace:*` to concrete versions.
- TS/TSX line guard: no files over `500` lines.
- MCP server dist forbidden test output count: `0`.
- MCP server dist stale root output count: `0`.
- `git diff --check`: passed.

## Publishable Package Order

The future publish order is defined in `scripts/npm-publish-packages.mjs`:

```txt
packages/shared-types
packages/package-registry
packages/source-index
packages/jar-source-adapter
packages/datapack-adapter
packages/gradle-adapter
packages/java-jdtls-adapter
packages/kubejs-types-adapter
packages/kubejs-language-service
packages/workspace-detector
packages/runtime-manager
packages/resource-registry
packages/external-mod-resolver
packages/agent-harness
packages/docs-retrieval
packages/source-package-manager
packages/vanilla-source-adapter
packages/service-profile
apps/mcp-server
```

## Remaining Before Real Upload

- Choose the real package version; current version remains `0.0.0`.
- Decide whether to replace `UNLICENSED` with a project license before public npm publication.
- Run the same verification commands on a clean tree immediately before publishing.
- Publish with `pnpm publish` rather than plain `npm publish`, because pnpm rewrites `workspace:*` dependency ranges during packaging.
