# Java And Gradle Mod Playbook

Use for Java mod code, NeoForge/Forge/Fabric projects, Gradle dependencies, repositories, source jars, mappings, mixins, access wideners/transformers, and Java diagnostics.

## Structured First Call

```json
{
  "requestText": "Context only: inspect Java mod workspace before editing.",
  "workspaceRoot": "/path/to/mod-project",
  "operations": [
    { "kind": "source_acquisition_plan" },
    { "kind": "workspace_source", "workspaceSource": { "buildFiles": ["build.gradle"] } },
    { "kind": "java_diagnostics" }
  ],
  "preparationRoutes": ["workspace_gradle"]
}
```

If Java diagnostics matter:

```json
{
  "requestText": "Context only: inspect Gradle and Java diagnostics.",
  "workspaceRoot": "/path/to/mod-project",
  "operations": [
    { "kind": "java_diagnostics" },
    {
      "kind": "workspace_source",
      "workspaceSource": {
        "javaSymbols": ["com.example.ExampleMod"],
        "buildFiles": ["build.gradle"]
      }
    }
  ],
  "preparationRoutes": ["workspace_gradle"]
}
```

## Source Jars

If dependencies are found but source jars are missing, call again:

```json
{
  "requestText": "Context only: look for dependency source jars.",
  "workspaceRoot": "/path/to/mod-project",
  "operations": [
    { "kind": "source_acquisition_plan" }
  ],
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
