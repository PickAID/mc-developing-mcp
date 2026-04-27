# Runtime Boundaries

## Purpose

This foundation keeps routing logic predictable by separating contract shapes, pipeline decisions, tool handlers, and external adapters.

## Rules

- Tools validate request shape, call one pipeline-facing dependency, and shape the response.
- Pipelines own routing, source priority, evidence ranking, and stop conditions.
- Adapters talk to filesystems, Gradle, LSP, JARs, ProbeJS, logs, and optional corpora through explicit contracts only.
- Support packages own cross-cutting policy such as limits, ranking, config, and normalized errors.

## Boundary Checks

- Runtime bootstrap may register pipelines and transports, but it must not inline search logic.
- Transport packages may expose the same handler set over multiple protocols, but they must not change handler behavior.
- Harness suites should exercise boundaries through public package APIs rather than private helpers.
