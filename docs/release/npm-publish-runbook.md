# npm Publish Runbook

This runbook prepares a real npm upload for `minecraft-developing-mcp`. Do not publish from a dirty tree and do not publish `0.0.0`.

Publishing to npm is irreversible for a package version. A published `name@version` cannot be reused later even if it is unpublished, and unpublish is constrained by npm policy. Treat every publish command as permanent.

## Release Shape

The MCP server publishes as one public npm package, `minecraft-developing-mcp`. Internal workspace modules must be bundled into that package rather than published as public npm dependencies.

## Preflight Decisions

- Choose a real version before publishing. The current stable package must use normal semver.
- Confirm the root `LICENSE` file and package license field match the intended release terms.
- Confirm the npm account has publish rights for the unscoped `minecraft-developing-mcp` package.
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

Use one semver version for the public `minecraft-developing-mcp` package. Internal workspace modules are implementation details and should not appear as published package dependencies.

Do not publish `0.0.0`. npm versions cannot be overwritten. `pnpm run publish:release-check` enforces this rule for real release preparation while normal development checks can still pass before a version is chosen.

## Runtime Version

The published packages require Node.js `>=22.5.0`. Several runtime paths use `node:sqlite` for source indexes, mod archive indexes, and offline documentation bundles, so Node 18/20 must not be advertised as supported until those paths have a fallback.

## Publish Order

Publish the package directory listed by `scripts/npm-publish-packages.mjs`:

```sh
pnpm --dir apps/mcp-server publish --access public
```

Use `--tag next` only for prerelease versions. Use the default `latest` tag for stable releases.

## Post-Publish Checks

Verify npm metadata:

```sh
npm view minecraft-developing-mcp version
npm view minecraft-developing-mcp bin
npm view minecraft-developing-mcp dependencies
```

Verify user-facing startup:

```sh
npx -y --package minecraft-developing-mcp mc-developing-mcp
```

Verify explicit bundled MDM resource installation through `mc_develop` using the `mdm-resources-v0.2.0` manifest URL. The MCP must not require a default remote download; users provide `manifestUrl` or `manifestPath` and set `downloadPolicy` to `allowed`.

For MCP clients, configure:

```json
{
  "command": "npx",
  "args": ["-y", "--package", "minecraft-developing-mcp", "mc-developing-mcp"]
}
```

## Verification Record

For normal development, keep verification in the terminal and commit message. Only create a dated verification document when explicitly requested for an audit trail.
