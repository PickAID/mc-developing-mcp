# External Mod Acquisition Resolver Spec
Date: 2026-05-01
Author: m1hono
Status: planned next slice

## Purpose
The MCP must be able to find the correct external mod artifact when the user gives a real development need such as:

- a mod name, slug, or CurseForge/Modrinth URL;
- a Maven coordinate from Gradle;
- a loader and Minecraft version constraint;
- a crash log that names a missing mod id, package, class, or dependency.

This must be a bottom-layer resolver first. It should not become a new public MCP tool unless the existing `mc_develop` progressive flow cannot express it.

## Separation From Resource Packages
Datapack and resource-pack packages are separate package concepts.

- `datapack`: official or derived `data/**` content.
- `resource-pack`: official or derived `assets/**` content.
- `assets`: legacy compatibility name only.
- External mod jars are not datapack/resource-pack packages. They are acquisition candidates that can later feed mod archive indexes, source lookup, datapack content lookup, and resource-pack evidence.

## Resolver Priority
The resolver must avoid token waste and avoid guessing unavailable project code.

Preferred order:

1. Use already local evidence first: workspace files, Gradle dependency model, Gradle cache, `mods/*.jar`, nested JarJar, local source jars, and existing runtime caches.
2. If a Maven coordinate is present, resolve through configured Maven repositories and `maven-metadata.xml`.
3. If a Modrinth slug/id or query is present, use Modrinth API search and project-version APIs.
4. If a CurseForge project id/url/query is present and credentials are configured, use CurseForge API search/files/download-url APIs.
5. Only if the user explicitly allows fragile fallback behavior, parse download pages for hints. Page scraping must not be the primary path.

## Output Contract
Each resolver should return a compact candidate list, not raw page/API dumps.

Candidate fields:

- `source`: `local`, `gradle`, `maven`, `modrinth`, or `curseforge`.
- `confidence`: numeric or enum confidence with reasons.
- `projectId`, `slug`, `title`, and `modId` when available.
- `minecraftVersions` and `loaders`.
- `fileName`, `downloadUrl`, and checksum metadata when available.
- `requiresConfirmation`: always true before downloading a new remote artifact.
- `cachePolicy`: `metadata_only`, `download_allowed`, or `download_denied`.
- `warnings`: credential missing, ambiguous match, stale cache, unsupported loader, or page-scrape fallback.

## Source Rules
### Modrinth
Use API-first resolution.

Required behavior:

- Search projects with facets for `project_type:mod`, loader category, and Minecraft version where possible.
- Resolve project versions with `loaders` and `game_versions` filters.
- Prefer primary files, then non-server-only jar files.
- Preserve upstream hashes such as SHA-1 and SHA-512.
- Send a clear user agent.

Official references:

- <https://docs.modrinth.com/api/operations/searchprojects/>
- <https://docs.modrinth.com/api/operations/getprojectversions/>

### Maven
Use repository layout rules.

Required behavior:

- Parse exact Gradle/Maven coordinates when present.
- Resolve missing or dynamic versions from `maven-metadata.xml`.
- Support configured repositories from Gradle plus known loader/modding Maven repositories.
- Return artifact URLs deterministically without downloading until policy allows it.
- Prefer `-sources.jar` for code lookup when available, and binary `.jar` for mod archive indexing.

Official reference:

- <https://maven.apache.org/repositories/layout.html>

### CurseForge
Use API-first resolution.

Required behavior:

- Require an API key or configured credential provider for official API calls.
- Resolve project search, file list, and download URL through API endpoints.
- Report `credentials_required` instead of scraping by default when credentials are missing.
- Treat download-page parsing as a diagnostic fallback only, because page layout and anti-bot behavior are not stable API contracts.

Official reference:

- <https://docs.curseforge.com/rest-api/>

## Cache And Privacy
Remote metadata can be cached in runtime-local SQLite or JSON cache files.

Rules:

- Metadata cache can be reused without user confirmation.
- Downloading jar files requires explicit policy/confirmation.
- Downloaded user modpack artifacts are private runtime cache content, not repository content.
- Checksums must be recorded when upstream provides them.
- Cache entries must record source URL, resolver version, request constraints, and retrieval time.

## Integration
The resolver should feed existing systems rather than bypass them.

- Resolved binary jars feed `@mcpskill/jar-source-adapter`.
- Resolved source jars feed source package/index lookup.
- Resolved Maven coordinates feed Gradle source archive lookup.
- Resolved datapack/resource content inside jars feeds existing datapack/resource evidence.
- MCP output should remain compact and evidence-ranked.

## Non-Goals
- Do not create a public `download_mod` tool in this slice.
- Do not auto-download remote jars without explicit policy.
- Do not store remote mod jars or private modpack caches in git.
- Do not rely on CurseForge page scraping as a required path.
