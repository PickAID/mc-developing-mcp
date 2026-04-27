# Implementation Guardrails

Author: m1hono
Date: 2026-04-06
Status: Active

## Purpose

This repo is moving toward a self-sufficient MCP backend for Minecraft modding work. Each new design and implementation step should be feasible, source-backed, and readable even for someone who does not speak Go fluently.

## Authoring Rule

- Use `m1hono` as the human-facing author name in new design, review, and report documents.
- Do not rename the current Go module path or import path in the same pass.
  `github.com/gedwen/...` is a compatibility boundary, not just author metadata.

## Feasibility Check Rule

Before each new design batch or implementation batch:

1. Check at least one MCP/protocol reference and at least one domain reference.
2. Write down what pattern is being borrowed, what is being adapted, and what is intentionally not copied.
3. Prefer patterns that already prove the target workflow is possible in a real project.
4. If the repo cannot match the reference project fully, keep the difference explicit in the design note or review note.

## Current Reference Set

- MCP SDK baseline:
  [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk)
  Use this as the reference point for Go-side MCP shape, transport vocabulary, and future protocol alignment.
- MCP ecosystem context:
  [official discussion for `modelcontextprotocol/go-sdk`](https://github.com/orgs/modelcontextprotocol/discussions/224)
  This is useful when deciding whether a local abstraction is future-proof or just a temporary convenience.
- PrismLauncher instance model:
  [PrismLauncher/PrismLauncher](https://github.com/PrismLauncher/PrismLauncher)
  Use this to validate that instance-root assumptions and multi-instance workflows are grounded in a real launcher layout.
- KubeJS project reality:
  [KubeJS-Mods/KubeJS](https://github.com/KubeJS-Mods/KubeJS)
  Use this when judging what belongs in core KubeJS vs plugin/addon space and when checking folder and integration expectations.
- ProbeJS workflow and typings:
  [ProbeJS wiki page](https://kubejs.com/wiki/addons/probejs)
  [KubeJS getting started page](https://kubejs.com/wiki/tutorials/getting-started)
  Use these to confirm how `.d.ts`, snippets, and VS Code-facing dump workflows are actually expected to behave.

## Readability Rule For Go Changes

- Keep each file under 500 lines.
- Prefer one file, one responsibility.
- Add short comments above helpers that are not obvious to a Python/TypeScript reader.
- When a test or helper uses two paths for one scenario, name the two roles explicitly.
  Example: outer fixture path vs runtime root.
- Pair any non-trivial Go change with a Markdown explanation that states:
  - what changed
  - why it changed
  - what a Python/TypeScript reader should compare it to mentally

## Review Export Rule

Every meaningful implementation batch should leave behind a Markdown review note with:

- commands run
- raw test output
- review findings
- fixes applied
- plain-language explanation
- remaining follow-up items
