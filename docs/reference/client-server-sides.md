# Client/Server Side Separation Reference (Forge 1.20.1 / NeoForge 1.21.1)

This document defines side boundaries for architecture and code generation.
It is a reference for avoiding side-mixing bugs across Forge 1.20.1 and NeoForge 1.21.1.

## Scope and Intent

| Field | Value |
|---|---|
| Target loaders | Forge 1.20.1, NeoForge 1.21.1 |
| Focus | Physical vs logical side model, isolation rules, failure modes |
| Style | Architecture reference, side-safe patterns |
| Anti-goal | Tutorial walkthroughs, side-unsafe imports |

## Physical Side vs Logical Side

| Axis | Side | Meaning |
|---|---|---|
| Physical | Physical client | JVM process with rendering, audio, input, and client runtime |
| Physical | Physical dedicated server | Headless JVM process running server runtime only |
| Logical | Logical client | Interaction/render context for player presentation and input flow |
| Logical | Logical server | Authoritative game logic, world mutation, and rule evaluation |

Model rules:
- Physical side describes which process is running.
- Logical side describes which game context owns authority.
- A physical client can contain both logical client and logical server in singleplayer/LAN.
- A physical dedicated server contains only logical server.

## Integrated Server Semantics

Singleplayer and LAN host mode run an integrated server inside the client process.
This means one process hosts two logical sides with distinct responsibilities.
Client visuals still remain non-authoritative; world state authority stays on logical server.

## Side-Only Code Isolation

| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Client markers | `@OnlyIn(Dist.CLIENT)` appears in client-only contexts | `@OnlyIn` usage is removed from recommended mod code paths |
| Side executor | `DistExecutor` for dist-gated execution | Prefer dist-aware event registration and dist-scoped listeners |
| Safe structure | Separate `ClientSetup` class, registered on mod bus with client dist filter | Same structural pattern with dist-aware registration |

Isolation principles:
- Keep renderer, screen, key mapping, particle, and shader classes out of common entry paths.
- Register client listeners only on client dist.
- Keep common setup free of client package imports.

## What Runs Where

| Category | Side |
|---|---|
| Rendering pipelines, model layers, shaders, HUD overlays | CLIENT ONLY |
| Screen classes, GUI widgets, key mappings, raw input handlers | CLIENT ONLY |
| Particle factories and visual-only particle spawning | CLIENT ONLY |
| World modification, block/entity placement, loot generation | SERVER ONLY |
| Command execution and authoritative game rule enforcement | SERVER ONLY |
| Registry declarations (`Block`, `Item`, `EntityType`) | BOTH (definition shared, execution side-aware) |
| Data generation tasks and assets/data pack outputs | BOTH (tooling phase, not runtime authority) |
| Capabilities / attachments setup and synchronization hooks | BOTH (with side-specific access paths) |

## Common Crash and Fault Patterns

| Violation | Typical Symptom | Root Cause |
|---|---|---|
| Client class referenced on dedicated server path | Dedicated server startup crash | Class loading touches client-only package |
| GUI/screen code loaded on server | `ClassNotFoundException` / `NoClassDefFoundError` | Server runtime lacks client GUI classes |
| World logic touched from wrong execution context | `Accessing world from wrong thread` errors | Cross-thread or wrong-side world mutation |
| Logical-client assumptions in server logic | Desync, ghost state, invalid authority behavior | Non-authoritative context writes state |

## KubeJS Side Partitioning

| Script folder | Side model |
|---|---|
| `client_scripts/` | Logical client behavior (UI, client-only events, presentation-side logic) |
| `server_scripts/` | Logical server behavior (game rules, world logic, authoritative handlers) |
| `startup_scripts/` | Early bootstrap and registration-time wiring; keep side boundaries explicit |

KubeJS placement rule:
- Put side-specific logic in side-specific script folders.
- Keep startup scripts free of client-only class assumptions unless explicitly gated.

## Safe Side-Aware Patterns

- Gate side branches with `FMLEnvironment.dist` when side-sensitive code paths diverge.
- Use event-based client registration rather than static eager references.
- Isolate client setup into a dedicated class and register it only for client dist.
- Treat logical-server handlers as the only authority for world mutation.
- Keep networking and sync code explicit about sender side and handler side.

## DB Coverage Note

`FMLEnvironment`, `DistExecutor`, and `FMLJavaModLoadingContext` are real FML bootstrap classes but are NOT indexed in the source DB (the DB covers mod API source, not FML loader internals). These classes cannot be verified through MCP `find_class` queries. They are confirmed real through code references in indexed Forge/NeoForge source files.

## MCP Verification Queries

Run verification queries before emitting or accepting side-sensitive code.

```text
# Side-aware events (these are in the DB)
find_class("FMLCommonSetupEvent", "1.20.1", loader="forge")
find_class("FMLClientSetupEvent", "1.20.1", loader="forge")
search("Dist.CLIENT", "1.20.1", loader="forge")
search("@OnlyIn", "1.20.1", loader="minecraft")

# NeoForge side registration evidence
search("FMLClientSetupEvent", "1.21.1", loader="neoforge")
search("Dist.CLIENT", "1.21.1", loader="neoforge")

# FML bootstrap classes (NOT in DB — real but unindexed)
# FMLEnvironment, DistExecutor — verify via Forge/FML source if needed
```

If query evidence is missing, mark the output as `verify via MCP` before code generation.
