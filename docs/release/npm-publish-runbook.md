# npm Publish Runbook

This runbook prepares a real npm upload for `mc-developing-mcp`. Do not publish from a dirty tree and do not publish `0.0.0`.

## Release Shape

The MCP server is not a single self-contained tarball. `@mcpskill/mcp-server` imports internal runtime packages, so the publishable package closure must be released together in the order listed by `scripts/npm-publish-packages.mjs`.

## Preflight Decisions

- Choose a real version before publishing. The current development version `0.0.0` is not a release version.
- Decide whether the public release remains `UNLICENSED` or moves to an SPDX license with a root `LICENSE` file.
- Confirm the npm account has publish rights for the `@mcpskill` scope.
- Prepare npm 2FA/OTP if the account requires it.
- Confirm no private runtime cache, generated source cache, API key, or user modpack content is staged.
- Confirm the companion MDM resources release is available and verified. The current bundled release is `mdm-resources-v0.2.0`:

```txt
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json
```

## Required Verification

Run from the repository root:

```sh
git status --short --branch
pnpm install
pnpm test
pnpm run publish:check
pnpm run publish:dry-run
pnpm run publish:install-smoke
pnpm run publish:release-check
git diff --check
```

The Java diagnostics file may have unrelated local formatting edits during development. Do not include unrelated local edits in the release commit.

Also verify the companion MDM resources release before publishing the MCP package:

```sh
node ../mdm-sources/tools/verify-live-release.mjs \
  https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json
```

## Versioning

Use lockstep versions for the publishable `@mcpskill/*` package graph until the package boundaries are stable enough for independent versioning. This avoids MCP server installs resolving mismatched internal packages.

Recommended first public pre-release:

```txt
0.1.0-next.0
```

Recommended stable tag after real external validation:

```txt
0.1.0
```

Do not publish `0.0.0`. npm versions cannot be overwritten. `pnpm run publish:release-check` enforces this rule for real release preparation while normal development checks can still pass before a version is chosen.

## Runtime Version

The published packages require Node.js `>=22.5.0`. Several runtime paths use `node:sqlite` for source indexes, mod archive indexes, and offline documentation bundles, so Node 18/20 must not be advertised as supported until those paths have a fallback.

## Publish Order

Publish in this order:

```sh
node -e "import('./scripts/npm-publish-packages.mjs').then(m => console.log(m.publishablePackages.join('\n')))"
```

For each package directory:

```sh
pnpm --dir <package-dir> publish --access public
```

Use `--tag next` for pre-release versions and the default `latest` tag only for stable releases.

## Post-Publish Checks

Verify npm metadata:

```sh
npm view @mcpskill/mcp-server version
npm view @mcpskill/mcp-server bin
npm view @mcpskill/mcp-server dependencies
```

Verify user-facing startup:

```sh
npx -y --package @mcpskill/mcp-server mc-developing-mcp
```

Verify explicit bundled MDM resource installation through `mc_develop` using the `mdm-resources-v0.2.0` manifest URL. The MCP must not require a default remote download; users provide `manifestUrl` or `manifestPath` and set `downloadPolicy` to `allowed`.

For MCP clients, configure:

```json
{
  "command": "npx",
  "args": ["-y", "--package", "@mcpskill/mcp-server", "mc-developing-mcp"]
}
```

## Verification Record

Each release attempt must create or update a dated review document:

```txt
docs/reviews/YYYY-MM-DD-npm-release-verification.md
```

Record every command, pass/fail result, package count, real publish status, and any retry reason. If real publishing is intentionally skipped, state that explicitly.
