# Modrinth Resolver Verification
Date: 2026-05-02
Author: m1hono
Scope: `@mcpskill/external-mod-resolver`

## Summary
Added the first external mod acquisition resolver slice for Modrinth.

Implemented behavior:

- Resolves a Modrinth query/slug with loader and Minecraft version constraints.
- Uses Modrinth API endpoints instead of HTML scraping.
- Returns compact evidence-ranked candidates with project, version, file, hash, and confirmation metadata.
- Does not download jar files.
- Keeps cache policy at `metadata_only` and `requiresConfirmation: true`.
- Does not add a public MCP tool.

Official API references:

- <https://docs.modrinth.com/api/operations/searchprojects/>
- <https://docs.modrinth.com/api/operations/getprojectversions/>

## Red Phase
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts
```

Expected failure before implementation:

```text
FAIL packages/external-mod-resolver/src/modrinth.test.ts
Error: Cannot find module './modrinth.js'

Test Files  1 failed (1)
Tests  no tests
```

## Green Phase
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/modrinth.test.ts (2 tests)

Test Files  1 passed (1)
Tests  2 passed (2)
```

Package-level command:

```bash
pnpm --filter @mcpskill/external-mod-resolver test
```

Result:

```text
> tsc -b . && vitest run --root ../.. packages/external-mod-resolver/src/modrinth.test.ts

✓ packages/external-mod-resolver/src/modrinth.test.ts (2 tests)

Test Files  1 passed (1)
Tests  2 passed (2)
```

## Actual API Smoke
Command:

```bash
pnpm exec tsx -e 'import { resolveModrinthMod } from "./packages/external-mod-resolver/src/modrinth.ts"; void (async () => { const result = await resolveModrinthMod({ query: "sodium", loader: "fabric", minecraftVersion: "1.20.1" }); console.log(JSON.stringify({ source: result.source, query: result.query, warnings: result.warnings, candidates: result.candidates.slice(0, 1).map((candidate) => ({ confidence: candidate.confidence, confidenceReasons: candidate.confidenceReasons, projectId: candidate.projectId, slug: candidate.slug, title: candidate.title, versionNumber: candidate.versionNumber, loaders: candidate.loaders, minecraftVersions: candidate.minecraftVersions, fileName: candidate.fileName, hashes: Object.keys(candidate.hashes), requiresConfirmation: candidate.requiresConfirmation, cachePolicy: candidate.cachePolicy, downloadUrlPrefix: candidate.downloadUrl.slice(0, 64) })) }, null, 2)); })();'
```

Observed output:

```json
{
  "source": "modrinth",
  "query": "sodium",
  "warnings": [],
  "candidates": [
    {
      "confidence": "high",
      "confidenceReasons": [
        "matched Modrinth slug sodium",
        "matched loader fabric",
        "matched Minecraft 1.20.1",
        "selected primary jar file"
      ],
      "projectId": "AANobbMI",
      "slug": "sodium",
      "title": "Sodium",
      "versionNumber": "mc1.20.1-0.5.13-fabric",
      "loaders": ["fabric", "quilt"],
      "minecraftVersions": ["1.20.1"],
      "fileName": "sodium-fabric-0.5.13+mc1.20.1.jar",
      "hashes": ["sha1", "sha512"],
      "requiresConfirmation": true,
      "cachePolicy": "metadata_only",
      "downloadUrlPrefix": "https://cdn.modrinth.com/data/AANobbMI/versions/OihdIimA/sodium-"
    }
  ]
}
```

## Residual Risks
- This is not wired into `mc_develop` yet.
- Candidate ranking currently handles the common exact-slug path first; ambiguous natural-language query ranking should be expanded before MCP integration.
- No runtime cache has been added in this slice.
- Maven and CurseForge resolvers remain planned follow-up work.
