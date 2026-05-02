# External Mod Maven Routing Verification
Date: 2026-05-02
Author: m1hono
Scope: `@mcpskill/external-mod-resolver`

## Summary
Added Maven dispatch metadata to external mod candidates.

Implemented behavior:

- Modrinth candidates now include Modrinth Maven metadata.
- CurseForge candidates now include CurseMaven metadata when a project/file is resolved through API data.
- Gradle usage is returned at method level instead of as prose.
- CurseForge still requires user-supplied credentials and returns setup guidance when missing.
- No remote jar download is performed.

References:

- Modrinth Maven: <https://support.modrinth.com/en/articles/8801191-modrinth-maven>
- CurseMaven: <https://www.cursemaven.com/>
- CurseForge REST API: <https://docs.curseforge.com/rest-api/>

## Red Phase
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/curseforge.test.ts
```

Expected failure before implementation:

```text
FAIL packages/external-mod-resolver/src/curseforge.test.ts
Error: Cannot find module './curseforge.js'

Test Files  1 failed (1)
Tests  no tests
```

## Green Phase
Command:

```bash
pnpm --filter @mcpskill/external-mod-resolver test
```

Result:

```text
✓ packages/external-mod-resolver/src/curseforge.test.ts (2 tests)
✓ packages/external-mod-resolver/src/modrinth.test.ts (2 tests)

Test Files  2 passed (2)
Tests  4 passed (4)
```

## Actual API Smoke
Command:

```bash
pnpm exec tsx -e 'import { resolveModrinthMod, resolveCurseForgeMod } from "./packages/external-mod-resolver/src/index.ts"; void (async () => { const modrinth = await resolveModrinthMod({ query: "sodium", loader: "fabric", minecraftVersion: "1.20.1" }); const curseforge = await resolveCurseForgeMod({ slug: "jei", loader: "forge", minecraftVersion: "1.20.1", credentialProvider: () => undefined }); console.log(JSON.stringify({ modrinth: modrinth.candidates[0] && { coordinates: modrinth.candidates[0].mavenArtifacts[0].coordinates, aliases: modrinth.candidates[0].mavenArtifacts[0].aliases, repositoryGroovy: modrinth.candidates[0].mavenArtifacts[0].gradle.repositoryGroovy, loomModImplementation: modrinth.candidates[0].mavenArtifacts[0].gradle.loom.modImplementation }, curseforge: curseforge.warnings[0] }, null, 2)); })();'
```

Observed output:

```json
{
  "modrinth": {
    "coordinates": "maven.modrinth:sodium:OihdIimA",
    "aliases": [
      "maven.modrinth:sodium:mc1.20.1-0.5.13-fabric",
      "maven.modrinth:AANobbMI:OihdIimA",
      "maven.modrinth:AANobbMI:mc1.20.1-0.5.13-fabric"
    ],
    "repositoryGroovy": "maven { url = \"https://api.modrinth.com/maven\" }",
    "loomModImplementation": "modImplementation \"maven.modrinth:sodium:OihdIimA\""
  },
  "curseforge": {
    "code": "credentials_required",
    "message": "CurseForge API resolution requires CURSEFORGE_API_KEY. Create one at https://console.curseforge.com/?#/api-keys.",
    "setupUrl": "https://console.curseforge.com/?#/api-keys",
    "credentialEnvVar": "CURSEFORGE_API_KEY"
  }
}
```

Fixture-backed CurseForge candidate shape includes:

```json
{
  "coordinates": "curse.maven:jei-238222:7920915",
  "repositoryGroovy": "maven { url = \"https://cursemaven.com\" }",
  "loomModImplementation": "modImplementation \"curse.maven:jei-238222:7920915\"",
  "forgeGradleImplementation": "implementation fg.deobf(\"curse.maven:jei-238222:7920915\")"
}
```

## Residual Risks
- CurseForge real API smoke with a user key should be run locally, but the key must not be committed or written to docs.
- Broad CurseForge `searchFilter` remains low-confidence and needs ranking before MCP integration.
- Maven metadata resolution for ordinary Maven repositories remains a separate planned resolver.
- The resolver is not wired into `mc_develop` yet.
