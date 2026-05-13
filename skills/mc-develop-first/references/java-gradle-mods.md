# Java And Gradle Mod Playbook

Use for Java mod code, NeoForge/Forge/Fabric projects, Gradle dependencies, repositories, source jars, mappings, mixins, access wideners/transformers, and Java diagnostics.

## First Call

```json
{
  "requestText": "Inspect this Minecraft Java mod workspace before editing. Gather Gradle, loader, dependency, source jar, mapping, and Java diagnostic evidence relevant to the task.",
  "workspaceRoot": "/path/to/mod-project",
  "preparationRoutes": ["workspace_gradle"]
}
```

If Java diagnostics matter:

```json
{
  "requestText": "Inspect Gradle and Java diagnostics for this mod code issue before editing.",
  "workspaceRoot": "/path/to/mod-project",
  "preparationRoutes": ["workspace_gradle"]
}
```

## Source Jars

If dependencies are found but source jars are missing, call again:

```json
{
  "requestText": "Look for dependency source jars in the default Gradle user home for this mod task.",
  "workspaceRoot": "/path/to/mod-project",
  "preparationRoutes": ["workspace_gradle"],
  "gradleSourceDiscovery": {
    "includeDefaultGradleUserHome": true
  }
}
```

## What To Inspect

- `workspacePreparation`: Gradle files, loader, route readiness, next call patterns.
- `selectedEvidence`: Gradle dependencies, repositories, source archive hits, mappings, source index references.
- `javaDiagnostics`: compile/LSP diagnostics and representative errors.
- `mdmPackageRecommendations`: loader docs, source profiles, mapping profiles, version-change docs.

## Editing Rules

- Match the loader and Minecraft version detected by the MCP.
- Prefer APIs found in source jars, docs packages, or selected local sources.
- Do not assume NeoForge and Forge APIs are interchangeable across versions.
- For mixins, verify target class/member evidence before editing descriptors or injectors.
- For access wideners/transformers, verify target owner and descriptor evidence first.

## Build Verification

Use the repo's existing command when present:

```sh
./gradlew build
```

For narrower checks, use the project task that matches its loader setup, but do not invent a task if Gradle evidence does not show it. Report Java version/toolchain issues separately from code failures.
