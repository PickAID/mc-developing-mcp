# Next-Generation Minecraft MCP Foundation Design

Date: 2026-04-04
Status: Approved in design conversation, pending implementation planning
Scope: Foundation analysis for the system that will replace `MC-Skill`

## Purpose

Design the foundation for a new Minecraft modding MCP system that can replace the current `MC-Skill` without inheriting its monolithic structure. The new system must be stronger in runtime architecture, project intelligence, migration support, evidence quality, and long-term maintainability.

This document covers the first sub-project only: the foundation. It also records the planned follow-on sub-projects so the foundation is built for them rather than patched for them later.

## Executive Summary

Build a parallel next-generation runtime under `MCProgrammingSkill`, not inside the current production `MC-Skill` path. Use Go as the target runtime language. Design the system around pipelines and adapters from the start. Treat project-local intelligence as the primary source of truth. Treat Gradle and LSP as first-class inputs. Support on-demand JAR decompilation and indexing. Build a structured migration service for Java and KubeJS. Keep datapack support first-class across the whole system. Enforce a hard `500`-line limit on source code files. Design the harness in the foundation stage, not after implementation.

The current `MC-Skill` remains in service during construction. Once the new system meets the replacement bar and dependent services are ready to move, perform one main cutover and retire the old system.

## Current System Assessment

The current system is useful and already contains important assets:

- indexed source and documentation corpora
- a working MCP surface
- a modding-focused skill with strong verification intent
- early ProbeJS and project-scan support
- real reference material for Minecraft, KubeJS, Forge, NeoForge, and third-party libraries

It also has structural problems that justify a new foundation instead of incremental cleanup:

- core runtime logic is concentrated in oversized files
- tool routing, workspace logic, and source/reference concerns are mixed
- project-local intelligence is present but not deep enough
- current docs, reports, and skill contracts have drifted from the actual system
- the system still forces agents to spend too much effort locating missing or nonexistent project source

## Core Design Decisions

### 1. Replacement Strategy

Do not rewrite the current production runtime in place.

Build a new parallel runtime somewhere under `MCProgrammingSkill`. Keep `MC-Skill` running for current dependents. When the new runtime is proven and downstream services can move, cut over once and retire the old runtime.

### 2. Runtime Language

Use Go for the next-generation runtime.

Reason:

- better foundation for long-lived MCP processes
- better concurrency model for workspace scanning, LSP management, and batch evidence retrieval
- stronger compile-time contracts across pipelines and adapters
- better fit for high-performance, low-noise service behavior

This is a systems decision, not a claim that Go alone solves the problem. The main win comes from combining Go with a better architecture.

### 3. Architectural Shape

Use a pipeline-and-adapters architecture from day one.

Do not start with a service split that only leaves adapter seams for later. The foundation must already support:

- multiple information sources
- source-priority decisions by scenario
- fallback and degradation paths
- migration rule evaluation
- evidence packaging and ranking

### 4. File Size Governance

Apply a hard `500`-line limit to source code files only.

This limit does not apply to tests, documentation, reports, or plans. Most source files should remain under `300` lines. The limit is an architectural constraint, not a style suggestion.

### 5. Information Source Priority

Project-local information wins first.

The default priority is:

1. project-local intelligence
2. dependency and external-mod intelligence
3. reference corpora and offline documentation

This priority is not a blind fixed order. The system must detect the current scenario and then choose the right path. For example:

- modpack workspace: favor Gradle, LSP, project files, ProbeJS, and JAR inspection
- migration analysis: raise the weight of rule packs and cross-version reference corpora
- ordinary project bug: favor real workspace evidence and logs

### 6. Gradle and LSP

Treat Gradle and LSP as first-class system-managed services.

The new runtime must launch and manage its own LSP processes. It must not depend on a user’s editor session being present. Gradle model access and dependency analysis are also first-class, not optional helpers.

### 7. JAR Source Access

Support local on-demand decompilation and indexing of JAR files as a required capability.

This is necessary for:

- external libraries without checked-out source
- modpack debugging
- crash investigation across many mods
- symbol lookup where the project does not contain source code
- batch evidence retrieval without blind searching

The system should prefer higher-quality sources when available:

1. project source
2. attached source JAR
3. cached decompiled source
4. on-demand decompilation

### 8. Migration Scope

The migration service focuses on Java mod code and KubeJS.

Datapacks are not the primary migration target, but the overall system must still support datapacks across versions at a first-class level. Migration flows may call datapack-aware pipelines when worldgen, registry, or data-generation behavior is involved.

### 9. Skill Scope

A dedicated skill remains necessary.

The domain is too specialized and too sensitive to version, loader, mutability, workspace shape, and migration rules to rely on generic prompting alone.

The current skill is directionally good but no longer fully aligned with the real system. The replacement effort must include a full skill architecture, not just backend code.

## Target System Layout

Recommended repository placement:

```text
MCProgrammingSkill/
  mc-modding-mcp-next/
    cmd/
      mcp-stdio/
      mcp-http/
      migrate/
      ingest/

    internal/
      app/
      contracts/
      pipelines/
        resolve/
        workspace/
        search/
        docs/
        migrate/
        ingest/
      adapters/
        workspace/
          filesystem/
          probejs/
          gradle/
          lsp/
        corpus/
          sqlite/
          sourcefs/
          docsdb/
        jars/
          sourcejar/
          decompile/
          cache/
        migration/
          rules/
          diff/
        transport/
          mcp/
          http/
      tools/
        source/
        docs/
        workspace/
        migration/
      support/
        cache/
        logging/
        tracing/
        limits/
        ranking/
        errors/
```

## Architectural Rules

### Tool Handlers

Tool handlers stay thin. They validate input, call a pipeline, and shape the response. They do not own routing strategy, deep search logic, migration rules, or source ranking.

### Pipelines

Pipelines own decision-making. They determine what information is needed, which adapters to invoke, when to stop searching, and how to assemble evidence. Pipelines are the layer that saves agent attention.

### Adapters

Adapters talk to concrete systems:

- filesystem
- ProbeJS outputs
- Gradle
- LSP
- SQLite corpora
- source files
- source JARs
- decompilation cache
- logs and runtime artifacts

Adapters depend on contracts. They do not depend on each other directly except through explicit contracts and orchestrating pipelines.

### Contracts

Contracts define stable shapes for:

- tool requests and responses
- workspace descriptors
- evidence bundles
- migration findings
- source references
- diagnostics and ranking outputs

### Support Layer

The support layer contains shared operational pieces:

- caching
- ranking
- token-budget controls
- tracing
- logging
- error normalization

It must not become a dumping ground for business logic.

## Information Routing Model

The new runtime must not expose a large pile of low-level tools and force the agent to decide where to search. The runtime itself must decide.

Default routing model:

1. detect environment
2. classify request
3. choose pipeline
4. query project-local sources first
5. query dependency and JAR sources second
6. query reference corpora third
7. assemble evidence
8. compress and rank output

The result should be a small number of high-value composite tools rather than many raw probing tools.

## Batch Evidence and Token Efficiency

The system must support multi-file retrieval as a first-class capability.

The goal is not “read many files” in the abstract. The goal is to return the smallest evidence package that still lets the agent reason correctly.

Required behavior:

- fetch multiple relevant files in one call
- rank files by relevance
- deduplicate overlapping evidence
- return focused excerpts, not full raw dumps by default
- include enough structure for the agent to understand why each file matters
- expose evidence bundles with stable ordering and explicit rationale

This is especially important in:

- JAR-backed source analysis
- modpack debugging
- crash investigation
- migration impact analysis
- cross-file API tracing

## Workspace Intelligence Requirements

The foundation must be built for deeper project intelligence even if not every adapter is complete on day one.

It must support:

- project type detection
- modpack detection
- KubeJS workspace detection
- Gradle run-root and dependency analysis
- ProbeJS extraction at a deeper semantic level than simple regex scraping
- LSP-backed definitions, references, hover, diagnostics, and symbol lookup
- log-aware project context

The system should recognize that many real problems happen in environments where source is incomplete, generated, external, or hidden behind build tooling.

## Migration Service Design

The migration service is a first-class subsystem, not a helper around version diffs.

### Purpose

Given a version transition and a project context, determine:

- what the old code depends on
- what changed in the target version
- what can be mapped automatically
- what requires manual intervention
- what evidence supports the recommendation

### Inputs

- version context
- loader context
- Java and KubeJS code context
- workspace evidence
- JAR and dependency evidence
- rule packs
- reference corpora

### Outputs

Structured migration findings must include:

- old symbol or pattern
- new symbol or replacement pattern
- change type
- evidence sources
- confidence
- auto-fix eligibility
- affected files
- concise agent-facing guidance

### Two-Layer Model

#### Rule Layer

Stores explicit migration knowledge:

- known renames
- package moves
- loader differences
- KubeJS event changes
- mutability changes
- registration-flow changes

#### Evidence Layer

Verifies those rules against the current workspace using:

- LSP
- Gradle
- JAR inspection
- decompiled source
- project files
- reference corpora

This keeps migration grounded in the current project rather than generic lore.

## Harness Design

Harness design belongs in the foundation stage.

The harness must verify not only that results are correct, but that the system chose the right information sources and stayed efficient.

### Required Harness Layers

#### 1. Contract Harness

Verifies tool, pipeline, and adapter contracts.

#### 2. Workspace Scenario Harness

Verifies behavior across real or realistic scenarios:

- plain Java mod
- KubeJS project
- modpack
- only-JAR dependency environment
- Gradle present, LSP cold
- LSP present, Gradle degraded

#### 3. Migration Harness

Verifies Java and KubeJS migration flows across version and loader changes.

#### 4. Evidence Efficiency Harness

Verifies token-aware multi-file evidence packaging and ranking.

#### 5. Failure Harness

Verifies degradation behavior when:

- LSP fails
- Gradle parsing fails
- JAR decompilation fails
- databases are missing
- logs are incomplete
- adapters crash or return partial data

### Harness Success Criteria

The harness must measure:

- answer quality
- evidence quality
- routing correctness
- token cost
- latency and throughput
- failure recovery behavior

## Skill Architecture

### Is a Skill Still Needed?

Yes.

The domain is too specialized, and the failure modes are too expensive, to rely on generic prompting. The system still needs a modding skill that teaches the agent how to query it and how to interpret results safely.

### Is the Current Skill Good Enough?

Not fully.

It still has useful discipline:

- it emphasizes verification
- it encodes important modding caveats
- it promotes composite tool use

It is no longer fully reliable as the public contract because:

- it drifts from live tool counts and live capabilities
- it describes a more complete and more unified system than currently exists
- it does not yet model a clean transition from old runtime to new runtime

### Future Skill Strategy

Use a public router-facing skill contract.

During the migration period:

- one main router skill is the default entrypoint
- backend-specific skills may exist for internal validation and development
- the router decides whether to use the old runtime or the next runtime

After the new runtime becomes the main system:

- keep the public router-facing behavior stable
- retire the old backend
- optionally collapse the implementation behind the same public contract

The goal is stable agent behavior while the backend changes underneath it.

## Plugins, Styles, Components, and Guides

The new system must not treat plugin and guide knowledge as loose prose attached to the side of the project.

It needs a structured knowledge strategy for:

- plugin ecosystem detection
- component maps
- style and pattern guidance
- human-readable guides
- runtime-consumable guide metadata

### Plugin Ecosystem

The system must identify the active plugin and addon ecosystem of a project through:

- Gradle dependencies
- mod JARs
- KubeJS plugin registrations
- ProbeJS outputs
- logs when needed

### Style and Pattern Guidance

“Style” here means usage patterns, not visual presentation alone.

Examples:

- event handling patterns
- registry and builder patterns
- loader-specific idioms
- addon-specific KubeJS usage patterns
- common error patterns

### Components

The system should model components as structured knowledge units rather than burying them in prose. It should be able to answer not only what a class is, but what role it plays, what it works with, and what its replacement is across versions.

### Guides

Guide knowledge should exist in two layers:

- runtime-consumable structured metadata
- human-readable explanation documents

Implementation should introduce an explicit guide-source registry so the system knows exactly which plugin, style, component, and pattern guides are authoritative instead of guessing from scattered files.

## Non-Goals for This Foundation Spec

This spec does not implement all future subsystems. It only locks in the foundation decisions they require.

It does not:

- define every concrete MCP tool name for the next runtime
- define every migration rule
- fully specify every plugin knowledge source
- fully specify every LSP integration detail

Those belong in follow-on plans that inherit this foundation.

## Follow-On Sub-Projects

The foundation must explicitly prepare for these next workstreams:

1. workspace intelligence
   - deep Gradle integration
   - LSP orchestration
   - real ProbeJS semantic extraction
   - log-aware project analysis
   - JAR-backed external source resolution

2. migration platform
   - Java and KubeJS migration pipelines
   - rule packs
   - structured evidence bundles
   - cross-version and cross-loader guidance

3. skill and routing architecture
   - router skill
   - backend capability metadata
   - transition from old runtime to new runtime
   - eventual retirement of the old runtime

## Acceptance Bar for Replacing MC-Skill

The old runtime may be retired only when the new system proves:

- architectural compliance with the source-file size rule
- correct project-first routing
- reliable Gradle and LSP management
- strong JAR-source capability
- token-efficient multi-file evidence retrieval
- acceptable performance
- usable migration support
- readiness for existing dependent services to move

At that point, perform one main cutover and retire the old runtime.

## Conclusion

The next system should not be a cleaner copy of the current monolith. It should be a new runtime with a different center of gravity: project-first evidence, system-managed Gradle and LSP, first-class JAR intelligence, structured migration reasoning, and strong architectural boundaries.

That foundation is the only path that satisfies the “best in all parts” requirement without compromising the services that still depend on the current `MC-Skill`.
