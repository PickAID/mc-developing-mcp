# Foundation Harness

## Scope

The harness verifies four things while workspace intelligence expands:

- contracts remain stable at package boundaries
- scenario fixtures cover project, datapack, crash, and source-JAR shapes
- degraded services surface predictable status and routing fallback behavior
- evidence bundling stays token-aware, ordering-stable, and deduped

## Scenario Fixture Rules

- Each required scenario lives under `testdata/scenarios/<name>/`.
- Every scenario directory must include a `README.md` that explains why it exists.
- Fixtures should stay minimal: only add files that contribute to detection, degradation, or evidence behavior.

## Current Required Cases

- `plain_java_mod`
- `modpack_kubejs`
- `jar_only_dependency`
- `gradle_present_lsp_cold`
- `lsp_present_gradle_degraded`
- `datapack_project`
- `modpack_external_crash`
- `sourcejar_hit`

## Routing Coverage

- `datapack_project` verifies datapack detection and datapack-first classification.
- `modpack_external_crash` verifies log collection, crash-signal extraction, and crash-triage classification.
- `sourcejar_hit` keeps a fixture in place for source-JAR-preferred dependency retrieval.

## Extension Guidance

- Add new fixtures when a new routing branch or degradation mode appears in the runtime.
- Prefer realistic filenames and directory layouts over synthetic markers.
- Keep harness assertions at the package boundary level so refactors inside a package do not require widespread fixture rewrites.
