# minecraft-developing-mcp

[License: PolyForm Noncommercial 1.0.0](LICENSE)
[Node.js >=22.5.0](https://nodejs.org/)
[MCP stdio](https://modelcontextprotocol.io/)

MCP server for AI-assisted Minecraft development.

It helps an AI agent inspect real project evidence before writing Minecraft modding code. It is meant for Java mod projects, KubeJS modpacks, datapacks, resource packs, Gradle workspaces, crash logs, local mod jars, nested JarJar dependencies, mappings, and optional offline documentation packages.

The public tool surface is intentionally small: clients normally run the `mc-developing-mcp` binary and call one MCP tool, `mc_develop`.

## Why Use It?

Generic coding agents often waste context on Minecraft projects because the useful information is scattered across Gradle files, generated ProbeJS declarations, local jars, crash logs, datapack JSON, resource-pack assets, and version-specific APIs.

`minecraft-developing-mcp` gives the agent a focused way to ask:


| You are trying to do this          | What the MCP can check first                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fix a modpack crash                | Logs, missing classes, mixin targets, metadata, owner jars, nested JarJar content.                          |
| Write or fix KubeJS                | KubeJS folders, ProbeJS `.d.ts`, snippets, registries, items, events, and diagnostics.                      |
| Work on a Java mod                 | Gradle dependencies, Maven repositories, source jars, Java diagnostics, mappings, and local source indexes. |
| Edit datapacks                     | Pack roots, resource locations, version profiles, migration warnings, and vanilla datapack profiles.        |
| Edit resource packs/client visuals | Assets, models, item references, resource paths, client rendering hints, and shader reference hooks.        |
| Use offline docs                   | Explicitly installed MDM resource packages and SQLite indexes in a local cache.                             |


The goal is not to replace the coding agent. The goal is to make the agent stop guessing and start from project evidence.

## Installation

Stable install:

```sh
npm install -g minecraft-developing-mcp
```

Run the server:

```sh
mc-developing-mcp
```

For MCP clients, prefer `npx` so the project stays easy to update:

```json
{
  "mcpServers": {
    "minecraft-developing": {
      "command": "npx",
      "args": ["-y", "--package", "minecraft-developing-mcp@latest", "mc-developing-mcp"]
    }
  }
}
```

Optional agent Skill:

```sh
npx skills add PickAID/mc-developing-mcp --skill mc-develop-first -g -a codex -y
```

This installs `skills/mc-develop-first`, a pluggable operating guide for agents. It makes `mc_develop` the first evidence step for Minecraft APIs, schemas, loader behavior, crash causes, KubeJS/ProbeJS context, datapack/resource-pack version details, local jar ownership, docs/version resources, and runtime environment handling. The Skill includes task-specific playbooks under `references/` so agents can route KubeJS, crashes, Java/Gradle mods, datapacks/resource packs, docs resources, and runtime root questions without adding rules to `AGENTS.md`.

To remove it:

```sh
npx skills remove mc-develop-first -g -a codex -y
```

The older singular `skill` CLI currently uses `npx skill skills/<name>` and does not support an `add` subcommand in `skill@1.0.2`. If you specifically use that CLI, install from this repository by setting its base URL to the GitHub tree:

```sh
SKILL_BASE_URL=https://github.com/PickAID/mc-developing-mcp/tree/main npx skill skills/mc-develop-first
```

Requirements:

- Node.js `>=22.5.0`
- An MCP client that supports stdio servers
- A Minecraft project or modpack root when you want workspace-specific evidence
- A local Java JDK when you want Gradle, Java LSP/JDTLS, ForgeGradle/NeoForgeGradle, source generation, or Minecraft mod project diagnostics. The MCP can inspect some files without Java, but real Java mod evidence needs the same kind of JDK the project itself needs.

Recommended JDK baselines for Minecraft development:

| Minecraft target | Typical JDK |
| ---------------- | ----------- |
| `1.18.2` to `1.20.1` | JDK 17 |
| `1.20.5` to current modern releases | JDK 21 unless the loader/project says otherwise |

Set `JAVA_HOME` or use the JDK selected by your Gradle toolchain. If Java diagnostics or Gradle evidence looks incomplete, first verify:

```sh
java -version
./gradlew --version
```

## Basic Use

Ask your MCP client to use `mc_develop` before it writes code or diagnoses a Minecraft issue.

Example request:

```json
{
  "requestText": "This modpack crashes during startup. Find the likely missing class owner before suggesting a fix.",
  "workspaceRoot": "/path/to/minecraft-or-project"
}
```

KubeJS example:

```json
{
  "requestText": "Inspect ProbeJS/KubeJS context, then help fix this recipe script.",
  "workspaceRoot": "/path/to/PrismLauncher/instances/Example/minecraft"
}
```

Datapack/resource-pack example:

```json
{
  "requestText": "Check whether this resource location and model path are valid for this pack before editing assets.",
  "workspaceRoot": "/path/to/resourcepack-or-modpack"
}
```

The response is compact evidence for the agent: detected workspace facts, relevant files, package status, route decisions, warnings, and follow-up actions.

## Structured Output

`mc_develop` returns both human-readable text and `structuredContent`. The structured output is meant for agents and MCP clients that need reliable fields instead of parsing prose.

Top-level summaries currently include:

| Field                  | What it gives the agent                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `workspacePreparation` | Route readiness, detected workspace shape, missing prerequisites, and next call patterns. |
| `crashSignals`        | Compact crash/log signals such as exception classes, owner hints, resource paths, and FTB-related errors. |
| `javaDiagnostics`     | Java/LSP diagnostic counts and representative diagnostics when a Java diagnostics route runs. |
| `kubeJsQuality`       | KubeJS script quality warnings and evidence gathered from KubeJS/ProbeJS routes. |
| `clientVisualVerifier` | Client visual proof-chain status for assets, models, rendering, UI, and shader-oriented work. |

These summaries are intentionally shallow entry points. When an agent needs details, it should follow the referenced evidence blocks and suggested `nextCallPatterns` instead of guessing or issuing unrelated searches.

## Optional Offline Resources

The npm package does not bundle large generated datasets. Offline documentation and version profiles are distributed separately through MDM resource releases and are installed only when explicitly requested.

Current public resource manifest:

```txt
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json
```

Start with a discovery call that does not download anything:

```json
{
  "requestText": "Check whether an offline docs package would help this task."
}
```

After `structuredContent.resourceActions.actions` suggests a package and the user confirms the download, call again with the suggested patch and `downloadPolicy: "allowed"`:

```json
{
  "requestText": "Install the compact offline docs index and use it for this task.",
  "mdmReleaseInstall": {
    "manifestUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json",
    "packageId": "core-docs-search-sqlite",
    "downloadPolicy": "allowed"
  }
}
```

Recommended progressive flow:

1. Ask `mc_develop` for the task without `mdmReleaseInstall`.
2. Inspect `structuredContent.resourceActions.actions`.
3. If the suggested package is appropriate, call `mc_develop` again with that action's `inputPatch.mdmReleaseInstall`, changing `downloadPolicy` from `disabled` to `allowed` only after user confirmation.
4. The next result can reuse the installed docs/source index artifacts from the local runtime cache.

Common resource package types:


| Type                  | Example                                         |
| --------------------- | ----------------------------------------------- |
| Docs index            | `core-docs-search-sqlite`                       |
| Datapack profile      | `minecraft-1.20.1-vanilla-datapack-profile`     |
| Resource-pack profile | `minecraft-1.20.1-vanilla-resourcepack-profile` |
| Vanilla schema docs   | `vanilla-schema-docs`                         |
| Mapping profile       | `minecraft-1.20.1-yarn-mapping-profile`         |
| Source profile/index  | `minecraft-1.20.1-vanilla-source-profile`       |


The npm package does not include MDM bundles. A release bundle is only a transport and verification container; the runtime cache stores the requested package artifact and local private indexes under `MC_DEVELOPING_MCP_RUNTIME_ROOT`. Vanilla datapack/resource-pack data is generated from Mojang distribution metadata on demand. Private modpack caches, generated Minecraft source, ProbeJS outputs, local jar indexes, and user jar-derived bundles should not be committed to this repository.

Vanilla datapack/resource-pack explanation docs are generated in `mdm-sources` from `SpyglassMC/vanilla-mcdoc` and `misode/misode.github.io`. The `vanilla-schema-docs` bundle internalizes compact mcdoc schema previews, upstream hashes, and misode generator/interpreter references, then refreshes through a scheduled upstream-update workflow before release.

## Configuration

Environment variables:


| Variable                           | Purpose                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `MC_DEVELOPING_MCP_WORKSPACE_ROOT` | Default workspace or modpack root if the request does not pass `workspaceRoot`.           |
| `MC_DEVELOPING_MCP_RUNTIME_ROOT`   | Runtime/cache root. Defaults to `~/.cache/mc-developing-mcp/runtime`.                     |
| `MC_DEVELOPING_MCP_PRISM_ROOT`     | Optional PrismLauncher root hint. The MCP must not assume Prism metadata exists.          |
| `MC_DEVELOPING_MCP_YARN_MAPPING_URL_TEMPLATE` | Optional Tiny v2 Yarn mapping URL template. Supports `{version}`, `{minecraftVersion}`, and `{family}`. |
| `MC_DEVELOPING_MCP_YARN_MAVEN_BASE_URL` | Optional Fabric Maven base URL for Yarn mapping artifact discovery.                       |
| `MC_DEVELOPING_MCP_MOJANG_VERSION_MANIFEST_URL` | Optional Mojang version manifest URL for Mojmap mapping acquisition.                      |
| `MC_DEVELOPING_MCP_PARCHMENT_MAVEN_BASE_URL` | Optional Parchment Maven base URL for Parchment metadata acquisition.                     |
| `MDM_SOURCES_ROOT`                 | Optional local `mdm-sources` checkout for resource development.                           |
| `CURSEFORGE_API_KEY`               | Optional CurseForge API key. Create one at `https://console.curseforge.com/?#/api-keys`.  |
| `SHADERTOY_APP_KEY`                | Optional ShaderToy API key. Without it, use browser-based fallback and compact summaries. |


Only `MC_DEVELOPING_MCP_*` environment names are supported for current setup.

## Developer Setup

```sh
pnpm install
pnpm build
pnpm test
```

Targeted server tests:

```sh
pnpm --filter minecraft-developing-mcp test
```

Publish checks:

```sh
pnpm publish:check
pnpm publish:dry-run
pnpm publish:install-smoke
pnpm publish:release-check
```

The publish dry-run and install smoke are important. They verify that the public package does not expose internal workspace dependencies and that the installed `mc-developing-mcp` binary can initialize and expose `mc_develop`.

## Architecture

This is a TypeScript monorepo.

```txt
apps/mcp-server/          Public stdio MCP server package.
apps/agent-runtime/       Private runtime app for local experiments.
packages/*                Internal libraries bundled into the public server package.
docs/architecture/        Runtime and routing design notes.
docs/specs/               Package/resource/source acquisition specs.
docs/standards/           KubeJS and client visual standards.
scripts/                  Publish guards, pack dry-run, and install smoke scripts.
```

The public MCP API should stay progressive and small. New capabilities should normally be added behind `mc_develop` routing rather than exposed as many unrelated MCP tools.

## Naming And Package Policy

The public package name is intended to be:

```txt
minecraft-developing-mcp
```

The binary remains:

```txt
mc-developing-mcp
```

Older scoped prerelease packages are not the recommended public install path. Use the unscoped stable package above.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Commercial use is not granted by this license. Contact the copyright holder if you need commercial terms.
