# External Mod Acquisition Resolver Plan
Date: 2026-05-01
Author: m1hono
Spec: `docs/superpowers/specs/2026-05-01-external-mod-acquisition-resolver-spec.md`

## Goal
Build a bottom-layer external mod resolver that can locate the right mod artifact from Modrinth, Maven repositories, and CurseForge API without expanding the public MCP tool surface.

## Current Status
- Initial Modrinth resolver package exists in `packages/external-mod-resolver`.
- Modrinth can resolve query/slug + loader + Minecraft version into a compact primary-jar candidate with hashes and explicit confirmation metadata.
- Maven, CurseForge, persistent metadata cache, orchestrator ranking, and MCP integration remain pending.

## Constraints
- TypeScript only.
- TDD required.
- Keep each source/test file under 500 lines.
- Do not download remote jars unless an explicit policy says download is allowed.
- Keep public MCP surface progressive and small.
- Prefer local/Gradle/JAR evidence before remote lookup.

## Task 1: Shared Resolver Model
- Add a package or module for external mod acquisition resolution.
- Define `ExternalModResolutionRequest`, `ExternalModCandidate`, `ExternalModResolverResult`, and `ExternalModResolverWarning`.
- Add tests for candidate ranking, confidence reasons, and no-download default behavior.

## Task 2: Maven Resolver
- Parse Gradle/Maven coordinates.
- Build deterministic artifact URLs from repository layout.
- Read `maven-metadata.xml` for missing/latest versions.
- Return binary jar and optional sources jar candidates.
- Test with fixture metadata and real URL-shape assertions.

## Task 3: Modrinth Resolver
- Status: initial implementation complete; ranking expansion remains pending.
- Search by query/slug/id using API endpoints.
- Filter project versions by Minecraft version and loader.
- Select primary jar files and preserve hash metadata.
- Add fixture tests for exact slug, ambiguous query, missing loader, and file selection.

## Task 4: CurseForge Resolver
- Add API-key/config-driven resolver.
- Search mods and list files through official API.
- Resolve download URL through API when `downloadUrl` is absent.
- Return `credentials_required` when no credential is configured.
- Add fixture tests for credential presence, missing credential, and file selection.

## Task 5: Orchestrator
- Implement resolver priority:
  1. local/Gradle/JAR evidence;
  2. Maven coordinate;
  3. Modrinth API;
  4. CurseForge API;
  5. explicit page-hint fallback only.
- Add tests proving Maven coordinates avoid remote project search and ambiguous remote hits are reported compactly.

## Task 6: MCP Integration
- Wire resolver into existing `mc_develop` evidence chain, likely behind `source.bundle` or crash/log analysis routes.
- Return compact structured candidates with confirmation requirements.
- Do not add a new public tool unless the integration proves the existing flow cannot express acquisition.

## Task 7: Verification Docs
- Record red/green outputs in `docs/reviews`.
- Include actual resolver return values for:
  - Modrinth query + version file selection;
  - Maven metadata resolution;
  - CurseForge missing-credential behavior;
  - CurseForge fixture API success behavior.
- Run `pnpm typecheck`, `pnpm test`, `git diff --check`, line guard, and Go residue guard.
