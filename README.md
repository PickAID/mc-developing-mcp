# mc-developing-mcp

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)
[![Node.js >=22.5.0](https://img.shields.io/badge/node-%3E%3D22.5.0-339933)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-111827)](https://modelcontextprotocol.io/)

> A TypeScript MCP server that helps AI agents work on Minecraft Java modding, KubeJS, datapacks, resource packs, Gradle workspaces, local mod archives, and optional offline documentation packages.

## What Is This?

`mc-developing-mcp` is a Model Context Protocol server for Minecraft development workflows. It is designed to reduce the time an AI assistant wastes guessing project structure, searching for nonexistent source files, or relying on stale Minecraft knowledge.

The server exposes a deliberately small public MCP surface. Most users call one tool, `mc_develop`, and let the server choose the right evidence routes internally.

## Why It Exists

Minecraft development often mixes Gradle projects, modpack jars, nested JarJar dependencies, generated ProbeJS types, KubeJS scripts, datapack content, resource-pack assets, loader metadata, mappings, and optional offline documentation. A generic coding assistant can burn a large context window before it even knows where the real information lives.

This MCP acts as a compact evidence layer:

| Problem | MCP behavior |
| --- | --- |
| Agent cannot find external mod source | Inspect Gradle dependencies, local jars, source jars, nested jars, and cached package indexes. |
| Agent treats KubeJS like normal JavaScript | Route through KubeJS/ProbeJS-aware evidence and authoring policy. |
| Crash log names a missing class or mixin target | Extract crash signals, trace owner jars, and inspect metadata or class indexes. |
| Datapack/resource-pack version rules are unclear | Use version profiles and local/MDM package evidence when available. |
| Offline docs are wanted but should not bloat npm | Install explicit MDM resource packages into the runtime cache only after confirmation. |

## Key Features

- **Single-tool public workflow**: `mc_develop` is the main MCP entrypoint; internal routes stay progressive and avoid tool-surface pollution.
- **Workspace and modpack detection**: Reads Gradle, KubeJS, Prism-style roots when available, local jars, logs, datapack roots, resource-pack roots, and runtime cache state.
- **Gradle and Java evidence**: Finds dependencies, source archives, binary archives, Maven repositories, local source indexes, and Java diagnostics when JDT LS is configured.
- **Jar and JarJar source inspection**: Indexes jar entries, metadata, assets, data files, classes, nested jars, mixin targets, access wideners, and resource references.
- **KubeJS and ProbeJS support**: Discovers ProbeJS type files, snippets, registry summaries, lifecycle/event evidence, and TypeScript language-service diagnostics without treating KubeJS as a normal npm project.
- **Datapack and resource-pack support**: Keeps data and assets as separate first-class domains, including version profiles, resource locations, item/model references, and UI/client visual evidence routes.
- **Source acquisition planning**: Can plan and run confirmed acquisition work for mappings, vanilla generation targets, local jars, remote metadata, and MDM source-index artifacts.
- **Optional offline MDM resources**: Uses separately distributed resource packages and SQLite indexes without embedding generated Minecraft source, private modpack data, or user cache data in npm.
- **Credential-safe remote lookup**: CurseForge and ShaderToy integrations require user-provided runtime credentials when needed; keys are not embedded in this package.

## Quick Start

### Requirements

- Node.js `>=22.5.0`
- An MCP client that can run stdio servers
- Optional: a Minecraft workspace, modpack root, Gradle project, ProbeJS output, local jars, or MDM resource release manifest

### Run From npm

After the prerelease package graph is published, use:

```sh
npx -y --package @mcpskill/mcp-server@next mc-developing-mcp
```

For a client config that accepts command/args:

```json
{
  "mcpServers": {
    "mc-developing": {
      "command": "npx",
      "args": ["-y", "--package", "@mcpskill/mcp-server@next", "mc-developing-mcp"]
    }
  }
}
```

### Run From Source

```sh
pnpm install
pnpm build
node apps/mcp-server/dist/stdio.js
```

## Using `mc_develop`

The tool accepts natural task text plus optional explicit roots and resource install instructions. A minimal request looks like:

```json
{
  "requestText": "Analyze this modpack crash and find the likely missing class owner.",
  "workspaceRoot": "/path/to/minecraft-or-project"
}
```

For modpack or KubeJS-heavy work, point it at the actual instance or project root:

```json
{
  "requestText": "Inspect KubeJS scripts and ProbeJS types before suggesting a recipe fix.",
  "workspaceRoot": "/path/to/PrismLauncher/instances/Example/minecraft"
}
```

The response is structured around evidence, not generic advice. Depending on the request, it may include workspace facts, route decisions, crash signals, Gradle dependencies, jar owners, ProbeJS summaries, resource-pack traces, datapack profiles, source-acquisition plans, and safe next actions.

## Evidence Routes

| Route area | What it can inspect |
| --- | --- |
| Workspace | Project root, Minecraft/modpack roots, Gradle files, KubeJS folders, datapack/resource-pack roots, logs, runtime cache. |
| Gradle | Repositories, dependency coordinates, source jars, binary jars, local Gradle cache archives, subproject dependencies. |
| Java/JDT LS | Java diagnostics, file synchronization, restart-safe sessions, LSP-backed evidence when available. |
| Mod archives | Mod metadata, jar inventory, nested JarJar archives, entry indexes, class owners, mixin targets, access wideners. |
| KubeJS/ProbeJS | ProbeJS discovery, tolerant `.d.ts` reading, resource summaries, snippets/items/registries, lifecycle/event evidence. |
| Datapack | Pack roots, resource locations, supported format profiles, migration analysis, vanilla datapack profile packages. |
| Resource pack/client visual | Assets, models, item references, resource roots, UI/render/shader evidence, vanilla assets profile packages. |
| External mods | Modrinth, CurseForge with API key, Maven repositories, local jars, Gradle-derived candidates. |
| MDM resources | Optional docs, mappings, source profiles, SQLite indexes, and release-bundled package artifacts. |

## Optional MDM Resources

MDM resources are not bundled into the npm package. They are downloaded only when explicitly requested, verified, and cached under the MCP runtime root.

Current public bundled release manifest:

```txt
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json
```

Example install request:

```json
{
  "requestText": "Install and use offline MDM docs for this task.",
  "mdmReleaseInstall": {
    "manifestUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json",
    "packageId": "core-docs-search-sqlite",
    "downloadPolicy": "allowed"
  }
}
```

Useful package examples:

| Package | Purpose |
| --- | --- |
| `core-docs-search-sqlite` | Compact SQLite docs search index. |
| `minecraft-1.20.1-vanilla-datapack-profile` | Vanilla datapack/profile evidence. |
| `minecraft-1.20.1-vanilla-resourcepack-profile` | Vanilla resource-pack/profile evidence. |
| `minecraft-1.20.1-yarn-mapping-profile` | Mapping profile evidence. |
| `minecraft-1.20.1-vanilla-source-profile` | Source profile metadata and index evidence, not a blanket npm-distributed source dump. |

The release uses channel bundles for datapack, resourcepack, mappings, and source-profile packages. The MCP downloads the bundle asset, verifies checksums, extracts the requested package member, verifies that member, and stores only the selected artifact in the runtime cache.

## Environment Variables

| Variable | Description |
| --- | --- |
| `MCPSKILL_WORKSPACE_ROOT` | Default workspace or modpack root when `workspaceRoot` is not provided. |
| `MCPSKILL_RUNTIME_ROOT` | Runtime/cache root. Defaults to `~/.cache/mc-developing-mcp/runtime`. |
| `MCPSKILL_PRISM_ROOT` | Optional PrismLauncher root hint. The server must not assume Prism metadata exists. |
| `MDM_SOURCES_ROOT` | Optional local checkout of `mdm-sources` for development and local resource testing. |
| `CURSEFORGE_API_KEY` | Optional CurseForge API key for CurseForge project/file lookup. Create one at `https://console.curseforge.com/?#/api-keys`. |
| `SHADERTOY_APP_KEY` | Optional ShaderToy API key for shader reference lookup. Without it, use a local browser fallback and keep summaries compact. |
| `MCPSKILL_YARN_MAPPING_URL_TEMPLATE` | Optional direct Yarn mapping URL template containing `{version}`. |
| `MCPSKILL_YARN_MAVEN_BASE_URL` | Optional Yarn Maven base URL. |
| `MCPSKILL_MOJANG_VERSION_MANIFEST_URL` | Optional Mojang version manifest override. |
| `MCPSKILL_PARCHMENT_MAVEN_BASE_URL` | Optional Parchment Maven base URL. |

## What Is Not Distributed

This repository and npm package should not contain:

- Generated Minecraft source code that users must acquire or generate themselves.
- Private ProbeJS outputs from user modpacks.
- Private modpack indexes, local jar-derived caches, or user paths.
- Embedded CurseForge, ShaderToy, npm, or other private API keys.
- Large generated offline datasets that belong in separately versioned MDM resource releases.

## Project Structure

```txt
mc-developing-mcp/
├── apps/
│   ├── mcp-server/          # Published stdio MCP server
│   └── agent-runtime/       # Private local runtime app
├── packages/
│   ├── agent-harness/       # Task routing, briefs, policies, and evidence injection
│   ├── datapack-adapter/    # Datapack/resource-pack profiles and migration helpers
│   ├── docs-retrieval/      # Offline docs records and guidance synthesis
│   ├── external-mod-resolver/ # Modrinth, CurseForge, Maven, and local resolution
│   ├── gradle-adapter/      # Gradle repository/dependency/source archive evidence
│   ├── jar-source-adapter/  # Jar, nested jar, metadata, content, and class indexes
│   ├── java-jdtls-adapter/  # JDT LS JSON-RPC/session/diagnostic support
│   ├── kubejs-language-service/ # TypeScript-backed KubeJS diagnostics
│   ├── kubejs-types-adapter/    # ProbeJS type/resource extraction
│   ├── package-registry/    # MDM package schema validation
│   ├── resource-registry/   # MDM artifact installation and cache status
│   ├── runtime-manager/     # Local runtime/cache layout and policy
│   ├── service-profile/     # Workspace/service profile assembly
│   ├── source-index/        # Source/document index primitives
│   ├── source-package-manager/ # Source acquisition jobs and hand-off logic
│   ├── vanilla-source-adapter/ # Confirmed vanilla generation/source profile support
│   └── workspace-detector/  # Workspace and modpack structure detection
├── docs/
│   ├── architecture/        # Runtime and routing boundaries
│   ├── release/             # npm release runbook
│   ├── reviews/             # Verification reports and command outputs
│   ├── specs/               # Delivery/package architecture specs
│   └── standards/           # KubeJS and client visual standards
└── scripts/                 # Publish guards, pack dry-runs, and smoke checks
```

## Development

```sh
pnpm install
pnpm build
pnpm test
```

Useful release checks:

```sh
pnpm publish:check
pnpm publish:dry-run
pnpm publish:install-smoke
pnpm publish:release-check
```

`publish:check` verifies package metadata, built entrypoints, public package closure, and that `dist` does not include test outputs or TypeScript source files. `publish:dry-run` packs each publishable package and verifies workspace dependency ranges are rewritten. `publish:install-smoke` installs the local tarballs into a temporary project and checks the installed `mc-developing-mcp` binary. `publish:release-check` runs the stricter release-mode guard.

## Publishing

This repository publishes a package graph, not a single bundled package. Internal runtime packages must be published before `@mcpskill/mcp-server`.

Before publishing:

```sh
npm whoami
pnpm test
pnpm publish:check
pnpm publish:dry-run
pnpm publish:install-smoke
pnpm publish:release-check
git diff --check
```

For prereleases, publish with the `next` tag only:

```sh
pnpm publish --access public --tag next --otp <six-digit-code>
```

Do not publish `0.1.0-next.0` without `--tag next`; npm publish is irreversible for a given `name@version`.

See [`docs/release/npm-publish-runbook.md`](docs/release/npm-publish-runbook.md) and [`scripts/npm-publish-packages.mjs`](scripts/npm-publish-packages.mjs) for the current package order.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Commercial use is not granted by this license. If you need commercial terms, contact the copyright holder.
