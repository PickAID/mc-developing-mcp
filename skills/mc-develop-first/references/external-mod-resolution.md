# External Mod Resolution Playbook

Use for Modrinth, CurseForge, CurseMaven, Modrinth Maven, Maven coordinates, dependency metadata, and remote mod source acquisition.

## Core Rule

Structured fields are the control plane. `requestText` is context.

Do not encode project ids, slugs, loaders, Minecraft versions, Maven coordinates, or repository URLs only in prose. Use `operations[].externalModRequests`.

## Resolution Modes

| Situation | What to send | What result means |
| --- | --- | --- |
| Known Modrinth project id or slug | `platform`, `projectId` and/or `slug`, `loader`, `minecraftVersion` | Final exact candidate set |
| Known CurseForge project id or slug | `platform`, `projectId` and/or `slug`, `loader`, `minecraftVersion` | Final exact candidate set if credentials exist |
| Known Maven coordinate | `platform: "maven"`, `coordinate`, optional `repositoryUrls` | Final artifact/source evidence |
| Unknown project id/slug | `query`, `loader`, `minecraftVersion` | Discovery only, not final proof |
| Unknown Maven coordinate | Use workspace Gradle/local jars first | Maven name search is not reliable |

## Modrinth Exact Project

```json
{
  "requestText": "Context only: resolve exact Modrinth coordinates.",
  "workspaceRoot": "/path/to/workspace",
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "modrinth",
          "slug": "sodium",
          "projectId": "AANobbMI",
          "loader": "neoforge",
          "minecraftVersion": "26.1.2"
        }
      ]
    }
  ],
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

Expected evidence: `selectedEvidence.payload.result.candidates[].mavenArtifacts` for one request, or `selectedEvidence.payload.results[].result.candidates[].mavenArtifacts` for batches.

## Unknown Modrinth Project

Use discovery first:

```json
{
  "requestText": "Context only: discover candidate Modrinth project.",
  "workspaceRoot": "/path/to/workspace",
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "modrinth",
          "query": "Sodium",
          "loader": "neoforge",
          "minecraftVersion": "26.1.2"
        }
      ]
    }
  ],
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

Then inspect candidates:

- If exactly one high-confidence project/version candidate matches title/loader/Minecraft version, retry with its `projectId` and `slug`.
- If candidates are ambiguous, report title, slug, project id, downloads, loaders, game versions, and why they are ambiguous.
- If local Gradle dependencies or mod jars exist, use `workspace_gradle` or `local_jar` evidence to disambiguate before asking the user.
- Do not present a discovery `query` result as a final Maven coordinate unless the MCP returned a single exact candidate and the final retry succeeded.

## CurseForge Exact Project

CurseForge API metadata requires `CURSEFORGE_API_KEY` in the MCP environment or injected tool options.

```json
{
  "requestText": "Context only: resolve CurseMaven coordinate.",
  "workspaceRoot": "/path/to/workspace",
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "curseforge",
          "slug": "jei",
          "projectId": "238222",
          "loader": "forge",
          "minecraftVersion": "1.20.1"
        }
      ]
    }
  ],
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

If credentials are missing, report the `credentials_required` warning and the `CURSEFORGE_API_KEY` requirement. Do not retry by broad web search unless the user asks.

## Unknown CurseForge Project

Use `query` only for discovery and only when credentials are available:

```json
{
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "curseforge",
          "query": "Just Enough Items",
          "loader": "forge",
          "minecraftVersion": "1.20.1"
        }
      ]
    }
  ],
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

If the result is ambiguous, ask for the CurseForge project page/id or use local Gradle/mod metadata. Do not infer a CurseMaven coordinate from a name alone.

## Maven Coordinate

```json
{
  "requestText": "Context only: resolve exact Maven artifact and source jar.",
  "workspaceRoot": "/path/to/workspace",
  "operations": [
    {
      "kind": "external_mod_resolution",
      "externalModRequests": [
        {
          "platform": "maven",
          "coordinate": "com.example:demo-mod:1.2.3",
          "repositoryUrls": ["https://maven.example/releases"]
        }
      ]
    }
  ]
}
```

If `repositoryUrls` is omitted, MCP may use Gradle repositories from the workspace. If the coordinate omits a version, Maven metadata must be available through cache or fetch.

## Remote Metadata During Source Acquisition

When planning source acquisition, keep exact external requests structured:

```json
{
  "requestText": "Context only: plan remote metadata for exact Modrinth project.",
  "workspaceRoot": "/path/to/workspace",
  "operations": [
    { "kind": "source_acquisition_plan" }
  ],
  "externalModRequests": [
    {
      "platform": "modrinth",
      "slug": "sodium",
      "projectId": "AANobbMI",
      "loader": "neoforge",
      "minecraftVersion": "26.1.2"
    }
  ],
  "preparationRoutes": ["modrinth"],
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

## Reading Results

- Modrinth Maven coordinate: `maven.modrinth:<slug>:<versionId>` from `mavenArtifacts[].coordinates`.
- Modrinth aliases may include version-number and project-id coordinates; prefer the primary `coordinates` unless the target build explicitly needs an alias.
- CurseMaven coordinate: `curse.maven:<slug>-<projectId>:<fileId>`.
- `requiresConfirmation: true` means metadata was resolved but file download/cache is not automatically approved.
- `needs_more_constraints` means the agent must retry with exact structured fields or ask for missing facts.
- Ambiguity warnings mean discovery is incomplete; do not silently pick one.

## Fallback Order

1. Exact structured project id/slug/coordinate.
2. Workspace Gradle dependencies and repositories.
3. Local mod jar metadata and filenames.
4. Remote discovery with `query`.
5. User confirmation or explicit web search when MCP evidence cannot disambiguate.
