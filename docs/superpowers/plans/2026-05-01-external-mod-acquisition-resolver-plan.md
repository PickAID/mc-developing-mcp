# External Mod Acquisition Resolver Plan
Date: 2026-05-01
Author: m1hono
Spec: `docs/superpowers/specs/2026-05-01-external-mod-acquisition-resolver-spec.md`

## Goal
Build a bottom-layer external mod resolver that can locate the right mod artifact from Modrinth, Maven repositories, and CurseForge API without expanding the public MCP tool surface.

## Current Status
- Initial Modrinth resolver package exists in `packages/external-mod-resolver`.
- Modrinth can resolve query/slug + loader + Minecraft version into a compact primary-jar candidate with hashes, Modrinth Maven dispatch metadata, and explicit confirmation metadata.
- CurseForge can return `credentials_required` without leaking keys and can resolve fixture-backed slug + loader + Minecraft version into CurseMaven dispatch metadata when a credential provider is configured.
- Maven resolver now parses explicit Gradle/Maven coordinates, builds deterministic binary/sources jar URLs, reads `maven-metadata.xml` when a version is omitted, and is wired Maven-first into MCP `external_mod_resolution`.
- Runtime-local Maven metadata cache now supports memory and file-backed cache adapters with cache hit/miss/write traces.
- Gradle-declared Maven repositories are now extracted and used before inferred default repositories when MCP resolves Maven coordinates without an explicit URL.
- Broad Modrinth and CurseForge searches now report compact ambiguous project matches instead of silently selecting the first remote hit.
- CurseForge file resolution now follows the official download-url endpoint when the selected file omits `downloadUrl`.
- MCP external mod request parsing now extracts Modrinth and CurseForge slugs from project/file URLs before falling back to token heuristics.
- Modrinth exact slug/project id resolution now checks `/project/{id|slug}` before broad search and falls back to search on 404.
- Modrinth file selection now skips sidecar `file_type` jars such as sources/dev/javadoc/signature/resource-pack entries before choosing a runtime jar.
- MCP external mod execution now preserves broad CurseForge query terms without inventing a slug; exact slug constraints are only passed when parsed from URL-backed requests.
- MCP external mod parsing now understands explicit `slug <value>` and `project id <value>` constraints and passes CurseForge project ids to the resolver.
- MCP external mod execution now checks Gradle-declared dependencies and local Gradle module-cache JARs before remote project lookup, including mod metadata read from the cached JAR when present.
- Gradle-declared dependency discovery now reads included subproject `build.gradle(.kts)` files from static `settings.gradle(.kts)` `include` declarations.
- Gradle-declared dependency discovery now honors simple workspace-relative `project(":x").projectDir = file("...")` mappings without executing Gradle.
- Gradle-declared binary archive discovery now accepts runtime classifier JARs such as `-all`, `-shadow`, `-dev`, and `-remapped` while excluding sources/javadoc classifiers.
- Modrinth and CurseForge broad search now support conservative strong-identity ranking for project id, slug, and title/name matches while preserving ambiguity for weak broad queries.
- MCP internal external mod resolution can pass user-provided CurseForge credential/fetch/base URL options and Modrinth/Maven fetch fixture options into the default resolvers.
- MCP external mod request parsing preserves multi-word natural mod names such as `Just Enough Items` when loader/version constraints follow the name.

## Constraints
- TypeScript only.
- TDD required.
- Keep each source/test file under 500 lines.
- Do not download remote jars unless an explicit policy says download is allowed.
- Do not ship or commit a shared CurseForge API key; require user-supplied credentials by default.
- Keep public MCP surface progressive and small.
- Prefer local/Gradle/JAR evidence before remote lookup.

## Task 1: Shared Resolver Model
- Add a package or module for external mod acquisition resolution.
- Define `ExternalModResolutionRequest`, `ExternalModCandidate`, `ExternalModResolverResult`, and `ExternalModResolverWarning`.
- Add tests for candidate ranking, confidence reasons, and no-download default behavior.

## Task 2: Maven Resolver
- Status: initial implementation complete for explicit coordinates, deterministic artifact URLs, optional sources candidates, metadata version resolution, and MCP Maven-first routing.
- Parse Gradle/Maven coordinates.
- Build deterministic artifact URLs from repository layout.
- Read `maven-metadata.xml` for missing/latest versions.
- Return binary jar and optional sources jar candidates.
- Test with fixture metadata and real URL-shape assertions.

## Task 3: Modrinth Resolver
- Status: initial implementation complete; Maven dispatch complete; direct slug/project id lookup complete; runtime jar selection complete; broad ambiguous search handling complete; conservative strong-identity search ranking complete.
- Search by query/slug/id using API endpoints, preferring direct project lookup before broad search.
- Filter project versions by Minecraft version and loader.
- Select primary runtime jar files, avoid known sidecar `file_type` entries, and preserve hash metadata.
- Emit Modrinth Maven coordinates and Gradle method-level usage.
- Add fixture tests for exact slug, exact project id, ambiguous query, missing loader, and file selection.

## Task 4: CurseForge Resolver
- Status: initial implementation complete for credentials handling, exact slug fixture resolution, broad ambiguous search handling, conservative strong-identity search ranking, download-url fallback, file selection, and CurseMaven dispatch; real API smoke with user key should be done separately and never committed with the key.
- Add API-key/config-driven resolver using `CURSEFORGE_API_KEY` as the default environment variable.
- Return `credentials_required` with the setup URL `https://console.curseforge.com/?#/api-keys` when no credential provider supplies a key.
- Search mods and list files through official API.
- Prefer exact project id or slug lookup; report broad `searchFilter` ambiguity until ranking has enough evidence to avoid a false positive.
- Resolve download URL through API when `downloadUrl` is absent.
- Emit CurseMaven coordinates and Gradle method-level usage.
- Add fixture tests for credential presence, missing credential, ambiguous query, and file selection.

## Task 5: Orchestrator
- Status: partial implementation complete for explicit Maven-coordinate priority, runtime-local Maven metadata cache, Gradle-declared Maven repository priority, Gradle-declared dependency/cache-JAR priority including runtime classifier JARs, included subprojects, and simple `projectDir` mappings, compact ambiguous remote search reports, conservative strong-identity remote ranking, URL-backed slug extraction, explicit slug/project-id constraint parsing, broad and multi-word query preservation, and internal CurseForge/Modrinth/Maven remote option pass-through inside MCP external mod resolution.
- Implement resolver priority:
  1. local/Gradle/JAR evidence;
  2. Maven coordinate;
  3. Modrinth API;
  4. CurseForge API;
  5. explicit page-hint fallback only.
- Add tests proving Maven coordinates avoid remote project search and ambiguous remote hits are reported compactly.
- Add tests proving remote project URLs are narrowed into exact platform + slug requests before resolver execution.
- Add tests proving ordinary CurseForge search terms do not bypass ambiguity handling by being treated as exact slugs.
- Add tests proving explicit slug/project-id follow-up text can route the next resolver call without broad search ambiguity.

## Task 6: MCP Integration
- Wire resolver into existing `mc_develop` evidence chain, likely behind `source.bundle` or crash/log analysis routes.
- Return compact structured candidates with confirmation requirements.
- Do not add a new public tool unless the integration proves the existing flow cannot express acquisition.

## Task 7: Verification Docs
- Status: verification docs exist for Modrinth/CurseMaven dispatch, MCP external mod resolution, explicit Maven coordinates, and Maven metadata cache.
- Record red/green outputs in `docs/reviews`.
- Include actual resolver return values for:
  - Modrinth query + version file selection;
  - Modrinth ambiguous project match;
  - Modrinth direct slug/project id lookup;
  - Modrinth runtime jar selection when sidecar jars are present;
  - Maven metadata resolution;
  - CurseForge missing-credential behavior;
  - CurseForge fixture API success behavior;
  - CurseForge ambiguous project match;
  - CurseForge missing `downloadUrl` fallback behavior;
  - Modrinth and CurseForge URL-backed request parsing;
  - CurseForge broad query versus exact URL slug routing;
  - explicit slug/project-id follow-up routing.
- Run `pnpm typecheck`, `pnpm test`, `git diff --check`, line guard, and Go residue guard.
