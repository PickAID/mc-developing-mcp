# 2026-05-08 npm Prerelease Readiness

## Scope

Checked whether `@mcpskill/*` `0.1.0-next.0` can be published after the bundled `mdm-resources-v0.2.0` release.

No real npm publish was performed.

## Verification

```sh
pnpm publish:check
pnpm publish:release-check
pnpm publish:dry-run
pnpm publish:install-smoke
pnpm test
git diff --check
```

Results:

- `pnpm publish:check`: passed for 19 packages.
- `pnpm publish:release-check`: passed for 19 packages in release mode.
- `pnpm publish:dry-run`: packed all 19 packages and rewrote internal dependency ranges.
- `pnpm publish:install-smoke`: installed 19 local package tarballs and verified the MCP binary exposes `mc_develop`.
- `pnpm test`: passed, 222 test files and 787 tests.
- `git diff --check`: passed.

## MDM Resource Release

Verified the companion MDM resources release before npm upload:

```txt
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json
```

Live verification passed with 466 packages, 466 install-verified packages, and 0 schema errors.

Real `mc_develop` calls installed these package classes from `mdm-resources-v0.2.0`:

- `core-docs-search-sqlite`
- `minecraft-1.20.1-vanilla-datapack-profile`
- `minecraft-1.20.1-vanilla-resourcepack-profile`
- `minecraft-1.20.1-yarn-mapping-profile`
- `minecraft-1.20.1-vanilla-source-profile`

## npm Registry State

`npm whoami` returned `ENEEDAUTH`; the local machine is not logged in to npm.

All 19 target package names currently appear unpublished on npm for `0.1.0-next.0`.

`npm org ls mcpskill` and `npm access list packages @mcpskill --json` returned npm `E404 Scope not found`. Before real publish, confirm that the publishing account owns the `mcpskill` user/scope or create/obtain access to the `@mcpskill` npm organization.

## Blockers Before Real Publish

- Decide whether public packages intentionally remain `UNLICENSED`. This is mechanically publishable but grants no open-source rights to public consumers.
- Log in to npm and confirm publish rights for the `@mcpskill` scope.
- Use `--tag next` for every `0.1.0-next.0` publish command. Do not let the prerelease become the npm `latest` dist-tag.
- Treat every package version as permanent. Published npm versions cannot be reused later even if unpublished.

## Publish Command Template

Publish in the order from `scripts/npm-publish-packages.mjs`.

For `0.1.0-next.0`, use:

```sh
pnpm --dir <package-dir> publish --access public --tag next
```

Do not run this until the blockers above are resolved.
