# Custom Networking and Packet Architecture Reference (Forge 1.20.1 / NeoForge 1.21.1)

This document defines packet architecture for custom networking across Forge 1.20.1 and NeoForge 1.21.1.

## Scope and Intent

| Field | Value |
|---|---|
| Target loaders | Forge 1.20.1, NeoForge 1.21.1 |
| Focus | Custom payload design, registration, dispatch, thread-safe handling |
| Style | Architecture reference, operational guardrails |
| Anti-goal | Step-by-step tutorial flow |

## When Custom Networking Is Needed

| Need | Why packet is required |
|---|---|
| Sync custom capability/attachment data | State is mod-defined and not auto-replicated |
| Trigger client-only effects from server | Particles, sounds, overlays need explicit client signal |
| Send player action intent to server | Server must validate and apply authoritative logic |
| Push targeted updates | Only specific players/tracking sets should receive updates |
| Login/configuration bootstrap | Client must receive negotiated data before play phase |

- Prefer `SynchedEntityData` for simple, frequently-updated entity fields.
- Use custom packets for complex structures, non-entity state, or explicit timing control.

## Forge 1.20.1: SimpleChannel Pattern

| Concern | Forge pattern |
|---|---|
| Channel creation | `NetworkRegistry.newSimpleChannel(...)` |
| Message shape | Message class with `encode`, `decode`, and handler |
| Buffer type | `FriendlyByteBuf` |
| Registration | `channel.registerMessage(id, Msg.class, Msg::encode, Msg::decode, Msg::handle)` |
| Client -> server send | `channel.sendToServer(msg)` |
| Server -> client send | `channel.send(PacketDistributor.PLAYER.with(...), msg)` |

Handler contract:
- Network handler entry is not guaranteed to be on the world/main thread.
- Schedule world interaction via `context.enqueueWork(...)`.
- Mark packet handled after scheduling (`context.setPacketHandled(true)`).

## NeoForge 1.21.1: CustomPacketPayload Pattern

| Concern | NeoForge pattern |
|---|---|
| Payload base type | Implement `CustomPacketPayload` |
| Type key | Define payload `Type` with namespaced id |
| Codec | Define `StreamCodec` for encode/decode |
| Registration event | `RegisterPayloadHandlersEvent` |
| Registrar | Register payload handler on event-provided registrar |
| Sending | Use `PacketDistributor` send methods for server/client targets |
| Handler context | Handler receives payload + `IPayloadContext` |

Handler contract:
- Treat handler entry as network-thread context.
- Use `IPayloadContext` task execution hooks to run world access on main thread.
- Keep decode/validation lightweight before scheduled world work.

## Thread Safety and World Access Rules

| Rule | Rationale |
|---|---|
| Never mutate world state directly on network thread | Avoid race conditions and illegal thread access |
| Decode first, schedule second, mutate third | Separates transport concerns from game logic |
| Validate sender/context before mutation | Prevent spoofed or invalid packet effects |
| Keep handlers side-explicit | Client visual effects and server authority must not mix |

World access scheduling summary:
- Forge: `context.enqueueWork(...)` in `NetworkEvent.Context`.
- NeoForge: use `IPayloadContext` execution hook for main-thread work.

## PacketDistributor Target Topology

| Target shape | Typical use |
|---|---|
| `server` | Client intent packet to authoritative logic |
| `player` | Personalized HUD/state feedback |
| `all` | Global announcements and rare world-wide sync |
| `tracking` | Entity/block updates for current watchers |
| `near` | Radius-scoped visual/sound effects |
| `dimension` | Dimension-wide state/event updates |

## NeoForge Configuration Tasks (Login-Phase Sync)

| Concern | Pattern |
|---|---|
| Registration | Register configuration tasks during config task registration events |
| Use case | Sync required data that must exist before play packets are processed |
| Ordering | Complete configuration exchange before enabling play-phase assumptions |
| Safety | Apply the same main-thread mutation rule for world/config state writes |

## Version Delta Matrix

| Area | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Core abstraction | `SimpleChannel` message registration | `CustomPacketPayload` + typed payload handlers |
| Serialization | Message `encode/decode` with `FriendlyByteBuf` | `StreamCodec` on payload type |
| Registration entry | Direct `registerMessage(...)` calls | `RegisterPayloadHandlersEvent` registrar flow |
| Handler context type | `NetworkEvent.Context` supplier | `IPayloadContext` |
| Main-thread scheduling | `enqueueWork(...)` | Context execution hook to main thread |
| Login/config bootstrap | Custom channel logic patterns | First-class configuration task workflow |

## MCP Verification Queries

```text
# Forge SimpleChannel evidence (1.20.1)
search("SimpleChannel", "1.20.1")
search("NetworkRegistry.newSimpleChannel", "1.20.1")
search("registerMessage", "1.20.1")
search("sendToServer", "1.20.1")
search("PacketDistributor.PLAYER", "1.20.1")
search("enqueueWork", "1.20.1")

# NeoForge payload evidence (1.21.1)
search("CustomPacketPayload", "1.21.1")
search("StreamCodec", "1.21.1")
search("RegisterPayloadHandlersEvent", "1.21.1")
search("IPayloadContext", "1.21.1")
search("PacketDistributor", "1.21.1")
search("configuration task", "1.21.1", loader="neoforge")

# Entity sync alternatives
search("SynchedEntityData", "1.20.1")
search("SynchedEntityData", "1.21.1")
```

If any query is missing direct API evidence, label the related statement as `verify via MCP` before code emission.
