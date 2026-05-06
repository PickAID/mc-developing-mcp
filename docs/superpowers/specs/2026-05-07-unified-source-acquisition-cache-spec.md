# Unified Source Acquisition And Cache Spec
Date: 2026-05-07
Author: m1hono
Status: active design

## Purpose

The MCP must acquire Java source evidence, jar-derived evidence, datapack/resourcepack content, and searchable indexes from multiple origins without forcing the agent to waste context on unavailable workspace code.

Supported origins:

- Modrinth project/file metadata, then selected jar acquisition and jar-derived indexes.
- CurseForge project/file metadata, then selected jar acquisition and jar-derived indexes with user-provided API credentials.
- Official Minecraft source/data/assets acquisition through local generation or user-approved Mojang downloads.
- GitHub source repository/archive acquisition when the task needs source-level evidence.
- Local workspace jars, user-specified jars, Gradle caches, and modpack `mods/*.jar`.
- Workspace Gradle and ProbeJS evidence when a workspace exists.

## Core Rule

Source acquisition must not require a workspace.

The runtime cache must be able to store packages, jar indexes, source indexes, docs indexes, and generated vanilla packages so the MCP can answer follow-up requests outside the original workspace. When a workspace exists, Gradle and ProbeJS are fast overlay evidence, not replacements for cache/index/package acquisition.

## Priority Model

The route order is deterministic:

1. Workspace Gradle evidence, if available.
2. Workspace ProbeJS evidence, if available.
3. Runtime cache: already indexed packages, jars, docs, and source indexes.
4. Local or user-specified jars.
5. Official vanilla local-generation targets.
6. Modrinth metadata and jar acquisition candidates.
7. CurseForge metadata and jar acquisition candidates.
8. GitHub source repository/archive candidates.

User input order must not reorder safety-critical source priority. For example, official local-generation should stay before remote mod platforms even if the request lists Modrinth first.

## Artifact Strategy

Each route must declare what it can produce:

- `read_declared_dependencies`: Gradle dependencies, repositories, and local Gradle cache jars.
- `read_probejs_types_and_registries`: KubeJS `.d.ts`, snippets, item/registry summaries, and generated type metadata.
- `query_cached_packages_and_indexes`: previously created runtime packages and SQLite indexes.
- `index_binary_jar`: binary jar central directory, classes, mod metadata, assets, data, nested JarJar, and optional decompiled/source-derived indexes.
- `generate_vanilla_source_or_assets`: official Minecraft source/data/assets generated locally with user consent.
- `resolve_remote_jar_metadata`: Modrinth/CurseForge metadata and selected jar candidates before download.
- `resolve_remote_source_repository`: GitHub source repo/archive candidates with provenance and license notes.

## Privacy And Distribution

- Public repositories can contain curated metadata, manifests, docs, and redistributable SQLite indexes.
- User modpack jars, downloaded mod jars, ProbeJS snapshots, private workspaces, and generated indexes are private runtime cache.
- Minecraft source/remapped source must be generated or downloaded locally after user confirmation unless a later legal policy explicitly changes.
- CurseForge credentials are user-provided only. Do not ship a shared key.

## MCP UX Contract

The public MCP surface should stay progressive. The default tool can remain `mc_develop`; the internal planner decides whether to use workspace evidence, cache, jar indexing, official generation, or remote resolution.

The returned evidence must be compact:

- route order and selected route;
- cache hit/miss information;
- whether user consent is required;
- exact origin and artifact strategy;
- warnings such as `remote_download_denied` or `curseforge_credentials_required`;
- no raw remote API dumps unless specifically requested for debugging.

## Current Implementation

The first code slice adds `planSourceAcquisition` in `@mcpskill/source-package-manager`.

It currently models route priority, cache strategy, consent flags, privacy, and workspace independence. It does not yet download remote artifacts or build jar/source indexes itself; those steps should be wired to existing packages:

- `@mcpskill/external-mod-resolver`
- `@mcpskill/jar-source-adapter`
- `@mcpskill/gradle-adapter`
- `@mcpskill/source-index`
- `@mcpskill/resource-registry`
- `@mcpskill/vanilla-source-adapter`
