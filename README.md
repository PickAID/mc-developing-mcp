# mc-developing-mcp

TypeScript MCP support for Minecraft Java, KubeJS, datapack, resource pack, Gradle, local mod archive, and optional offline documentation workflows.

The public MCP surface is intentionally small. Users normally run the `mc-developing-mcp` stdio binary and call the `mc_develop` tool; the server decides which evidence routes to use internally.

Optional offline MDM resources are distributed separately from the npm package. The current public bundled resource release is:

```txt
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json
```

The MCP does not download that release by default. Pass it explicitly through `mc_develop` `mdmReleaseInstall.manifestUrl` with `downloadPolicy: "allowed"` when you want to cache a package such as `core-docs-search-sqlite`, `minecraft-1.20.1-vanilla-datapack-profile`, `minecraft-1.20.1-vanilla-resourcepack-profile`, `minecraft-1.20.1-yarn-mapping-profile`, or `minecraft-1.20.1-vanilla-source-profile`.

## npm release preparation

This repository publishes a small package graph instead of a single bundled server package. The MCP server imports internal `@mcpskill/*` libraries at runtime, so every package in the runtime dependency closure must be publishable before `@mcpskill/mcp-server` is uploaded.

Run these checks before publishing:

```sh
pnpm install
pnpm test
pnpm run publish:check
pnpm run publish:dry-run
pnpm run publish:install-smoke
pnpm run publish:release-check
```

`publish:check` verifies package metadata, built entrypoints, public package closure, and that `dist` does not include test outputs or TypeScript source files. `publish:dry-run` creates temporary `pnpm pack` tarballs for each publishable package, verifies that workspace dependency ranges are rewritten to concrete versions, then removes the tarballs without uploading anything. `publish:install-smoke` installs the packed tarballs into a temporary project and verifies the installed `mc-developing-mcp` binary can initialize and expose `mc_develop`. `publish:release-check` runs the stricter release-mode guard and intentionally fails while versions remain `0.0.0`.

Real npm upload is intentionally not scripted yet. After choosing a real version, follow `docs/release/npm-publish-runbook.md` and publish with `pnpm publish` in the order listed in `scripts/npm-publish-packages.mjs` so `workspace:*` dependencies are converted to concrete package versions.
