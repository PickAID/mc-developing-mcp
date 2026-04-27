# Workspace Routing

## Purpose

The workspace-intelligence runtime must choose the cheapest reliable source of truth for a request. It should spend tokens on local evidence first and only expand outward when the workspace or logs prove that the code lives elsewhere.

## Routing Order

Normal source lookup follows this order:

1. Detect workspace capabilities and service state.
2. Classify the request into a routing scenario.
3. Search project-local source first.
4. Search source JARs when dependency ownership is likely.
5. Fall back to decompile output only after source JARs miss.
6. Use corpora last, and keep them optional.

## Service Priority

Gradle is the dependency authority. It owns source sets, dependency artifacts, and source-JAR hints when the service is ready.

Java LSP is the project symbol authority. It should answer local definition and symbol queries before filesystem heuristics when it is warm.

Filesystem, logs, and ProbeJS remain the cold-start fallback layer. The runtime must still answer when Gradle or LSP is unavailable.

## Scenario Rules

`project_symbol` keeps project source first and treats dependency paths as fallback.

`datapack_lookup` moves datapack roots ahead of Java source and corpus lookups.

`modpack_crash_triage` uses crash signals to raise source JAR and decompile stages above project search.

## Design Constraints

Keep tool handlers thin. Routing policy belongs in pipelines.

Keep corpora optional. A missing database must not block the request.

Return a compact multi-file evidence bundle. Do not dump every match.
