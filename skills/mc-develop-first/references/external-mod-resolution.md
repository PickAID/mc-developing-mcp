# External Mod Resolution Playbook

Use for Modrinth, CurseForge, CurseMaven, Modrinth Maven, Maven coordinates, dependency metadata, and remote mod source acquisition.

## Rule

Do not encode project ids, slugs, loaders, or Minecraft versions only in `requestText`. Use `operations` and `externalModRequests`.

`requestText` is context. Structured fields are the control plane.

If the task includes local jars, exact class owners, Gradle files, docs topics, datapack paths, or ProbeJS symbols, use the matching operation field in the same style: `modArchive`, `workspaceSource`, `docsQuery`, `datapack`, or `probeJs`.

## Modrinth Exact Project

```json
{
  "requestText": "Resolve exact Modrinth Maven coordinates for Sodium and Iris.",
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
        },
        {
          "platform": "modrinth",
          "slug": "iris",
          "projectId": "YL57xq9U",
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

Expected evidence: `selectedEvidence.payload.results[].result.candidates[].mavenArtifacts`.

## CurseForge Exact Project

CurseForge API metadata requires `CURSEFORGE_API_KEY` in the MCP environment or injected tool options.

```json
{
  "requestText": "Resolve CurseMaven coordinate for JEI.",
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

## Maven Coordinate

```json
{
  "requestText": "Resolve exact Maven artifact and source jar.",
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

When the goal is source-acquisition planning, keep the same structured request:

```json
{
  "requestText": "Plan remote metadata for this exact Modrinth project.",
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

## Fallbacks

Use `query` only when neither `slug` nor `projectId` is known. If the MCP reports ambiguity, ask for or look up the exact slug/project id, then retry with structured fields.
