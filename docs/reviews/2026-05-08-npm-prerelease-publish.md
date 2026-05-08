# npm prerelease publish report

Date: 2026-05-08T15:22:21Z

## Published versions

- `@mcpskill/*@0.1.0-next.0` was published first, but it was not suitable for installation because the direct `npm publish` path preserved internal `workspace:*` dependency ranges.
- `@mcpskill/*@0.1.0-next.1` was published from `pnpm pack` tarballs. This is the usable prerelease.

## Required install tag

Use the `next` tag:

```sh
npx -y --package @mcpskill/mcp-server@next mc-developing-mcp
```

Do not use the unqualified package name yet. npm created a `latest` dist-tag during the first publish. `@mcpskill/mcp-server` currently reports:

```txt
latest: 0.1.0-next.0
next: 0.1.0-next.1
```

`@mcpskill/shared-types` was moved to:

```txt
latest: 0.1.0-next.1
next: 0.1.0-next.1
```

Moving the remaining `latest` tags requires WebAuthn once per package. The safe public instruction for now is to install with `@next`.

## Verification commands and results

```sh
pnpm publish:check
```

Result:

```txt
npm publish guard passed for 19 package(s).
```

```sh
pnpm publish:dry-run
```

Result:

```txt
packages/shared-types: @mcpskill/shared-types@0.1.0-next.1 22 file(s), dependency ranges rewritten
packages/package-registry: @mcpskill/package-registry@0.1.0-next.1 18 file(s), dependency ranges rewritten
packages/source-index: @mcpskill/source-index@0.1.0-next.1 42 file(s), dependency ranges rewritten
packages/jar-source-adapter: @mcpskill/jar-source-adapter@0.1.0-next.1 90 file(s), dependency ranges rewritten
packages/datapack-adapter: @mcpskill/datapack-adapter@0.1.0-next.1 74 file(s), dependency ranges rewritten
packages/gradle-adapter: @mcpskill/gradle-adapter@0.1.0-next.1 26 file(s), dependency ranges rewritten
packages/java-jdtls-adapter: @mcpskill/java-jdtls-adapter@0.1.0-next.1 62 file(s), dependency ranges rewritten
packages/kubejs-types-adapter: @mcpskill/kubejs-types-adapter@0.1.0-next.1 54 file(s), dependency ranges rewritten
packages/kubejs-language-service: @mcpskill/kubejs-language-service@0.1.0-next.1 30 file(s), dependency ranges rewritten
packages/workspace-detector: @mcpskill/workspace-detector@0.1.0-next.1 30 file(s), dependency ranges rewritten
packages/runtime-manager: @mcpskill/runtime-manager@0.1.0-next.1 14 file(s), dependency ranges rewritten
packages/resource-registry: @mcpskill/resource-registry@0.1.0-next.1 42 file(s), dependency ranges rewritten
packages/external-mod-resolver: @mcpskill/external-mod-resolver@0.1.0-next.1 38 file(s), dependency ranges rewritten
packages/agent-harness: @mcpskill/agent-harness@0.1.0-next.1 54 file(s), dependency ranges rewritten
packages/docs-retrieval: @mcpskill/docs-retrieval@0.1.0-next.1 34 file(s), dependency ranges rewritten
packages/source-package-manager: @mcpskill/source-package-manager@0.1.0-next.1 90 file(s), dependency ranges rewritten
packages/vanilla-source-adapter: @mcpskill/vanilla-source-adapter@0.1.0-next.1 30 file(s), dependency ranges rewritten
packages/service-profile: @mcpskill/service-profile@0.1.0-next.1 22 file(s), dependency ranges rewritten
apps/mcp-server: @mcpskill/mcp-server@0.1.0-next.1 375 file(s), dependency ranges rewritten
```

```sh
pnpm publish:install-smoke
```

Result:

```txt
npm install smoke passed with 19 local package tarball(s).
```

```sh
pnpm publish:release-check
```

Result:

```txt
npm publish guard passed for 19 package(s) in release mode.
```

```sh
npm view @mcpskill/mcp-server@next version bin dependencies --json
```

Result summary:

```json
{
  "version": "0.1.0-next.1",
  "bin": {
    "mc-developing-mcp": "dist/stdio.js"
  },
  "dependencies": {
    "@mcpskill/agent-harness": "0.1.0-next.1",
    "@mcpskill/shared-types": "0.1.0-next.1"
  }
}
```

The real dependency output contains all internal runtime packages pinned to `0.1.0-next.1`; no `workspace:*` ranges remain in the `@next` package.

```sh
npm_config_cache="$(mktemp -d /tmp/mcpskill-npm-cache.XXXXXX)" \
  npm exec --yes --package @mcpskill/mcp-server@next -- mc-developing-mcp
```

Result summary:

```txt
initialize: serverInfo.name=mc-developing-mcp
tools/list: exposes mc_develop
```

## Notes

- The package graph is public under the `@mcpskill` scope.
- The package license is `PolyForm-Noncommercial-1.0.0`.
- Each published package includes a package-local `LICENSE` file.
- WebAuthn/Passkey npm accounts can publish through `npm publish <tarball> --auth-type=web`; direct `pnpm publish` cannot pass that auth option.
