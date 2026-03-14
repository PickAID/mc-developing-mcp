# BlockEntity Architecture Reference

This document captures the BlockEntity architecture used in Forge 1.20.1 and NeoForge 1.21.1.
It focuses on type registration, block linkage, ticking, persistence, synchronization, and renderer registration.

## Architecture Surface

| Area | Forge 1.20.1 | NeoForge 1.21.1 | Notes |
|---|---|---|---|
| Type creation | `BlockEntityType.Builder.of(factory, blocks...)` | `BlockEntityType.Builder.of(factory, blocks...)` | Builder API is structurally the same.
| Builder finalize | `build(Type<?>)` (commonly `build(null)`) | `build(Type<?>)` (commonly `build(null)`) | Used by registry bootstrap.
| Block linkage | `EntityBlock` + `newBlockEntity(BlockPos, BlockState)` | `EntityBlock` + `newBlockEntity(BlockPos, BlockState)` | Same construction contract.
| Tick hook | `EntityBlock#getTicker(...)` returns `BlockEntityTicker<T>` | `EntityBlock#getTicker(...)` returns `BlockEntityTicker<T>` | Usually gated by `createTickerHelper`.
| Persistent load | `load(CompoundTag)` | `loadAdditional(CompoundTag, HolderLookup.Provider)` | 1.21.1 introduces lookup provider.
| Persistent save | `saveAdditional(CompoundTag)` | `saveAdditional(CompoundTag, HolderLookup.Provider)` | Same intent, signature drift.
| Update tag | `getUpdateTag()` / `handleUpdateTag(CompoundTag)` | `getUpdateTag(HolderLookup.Provider)` / `handleUpdateTag(CompoundTag, HolderLookup.Provider)` | Chunk-load sync channel.
| Update packet | `getUpdatePacket()` + `ClientboundBlockEntityDataPacket.create(this)` | same packet pattern | Block-update sync channel.
| BER register | `EntityRenderersEvent.RegisterRenderers` (mod bus) | `EntityRenderersEvent.RegisterRenderers` and `BlockEntityRenderers.register(...)` / `EntityRenderers.register(...)` | Both are client-only registration paths.

## 1) BlockEntity Type Creation and Registration

- `BlockEntityType.Builder.of(factory, blocks...)` defines the constructor factory and valid block set.
- `Builder#build(Type<?>)` finalizes the type; mods usually pass `null` for DataFixer type.
- Registration stays in the mod registry path (`DeferredRegister` family per loader conventions).
- The architectural invariant is one `BlockEntityType` per logical behavior, bound to explicit valid blocks.

## 2) Linking BlockEntity to Block

- Blocks hosting a BlockEntity implement `EntityBlock`.
- `newBlockEntity(BlockPos, BlockState)` is the creation gateway used by world/chunk code.
- The block type and `BlockEntityType` valid block set must agree; mismatch causes invalid-state failures.
- Keep construction side-effect free; game state mutation belongs in tick/events, not constructors.

## 3) Tick Handling Model

- Tick dispatch is block-owned: `EntityBlock#getTicker(Level, BlockState, BlockEntityType<T>)`.
- Returned ticker is usually a static method reference (`MyBlockEntity::tick`).
- Gate ticker by type (`BaseEntityBlock.createTickerHelper(...)`) to avoid invalid casts.
- Server/client branch inside tick is explicit (`if (level.isClientSide) ...`).
- Tick method should mutate state, call `setChanged()` when persistence-relevant fields change, and selectively trigger network sync.

### Tick method shape

```java
public static void tick(Level level, BlockPos pos, BlockState state, MyBlockEntity be) {
    if (level.isClientSide) return;
    // mutate server state
    be.setChanged();
}
```

## 4) NBT Persistence Contracts

### Version differences

| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Read custom data | `load(CompoundTag tag)` | `loadAdditional(CompoundTag tag, HolderLookup.Provider registries)` |
| Write custom data | `saveAdditional(CompoundTag tag)` | `saveAdditional(CompoundTag tag, HolderLookup.Provider registries)` |
| Base call | `super.load(tag)` / `super.saveAdditional(tag)` | `super.loadAdditional(tag, registries)` / `super.saveAdditional(tag, registries)` |

- 1.20.1 custom fields typically live in `load` and `saveAdditional`.
- 1.21.1 separates component-aware load paths and adds registry lookup context.
- Persist only durable state; transient client cache should not be serialized.

## 5) Three-Channel Data Synchronization Model

BlockEntity synchronization is not a single mechanism. Use three channels by intent.

### A) Chunk-load sync (initial client state)

- Server serializes initial client-visible state in `getUpdateTag`.
- Client applies it via `handleUpdateTag`.
- 1.20.1 handshake: `getUpdateTag()` + `handleUpdateTag(CompoundTag)`.
- 1.21.1 handshake: `getUpdateTag(HolderLookup.Provider)` + `handleUpdateTag(CompoundTag, HolderLookup.Provider)`.

### B) Block-update packet sync (runtime state updates)

- Override `getUpdatePacket()` and return `ClientboundBlockEntityDataPacket.create(this)`.
- After mutating sync-relevant fields on server, call:
  - `setChanged()` for persistence bookkeeping.
  - `level.sendBlockUpdated(pos, oldState, newState, flags)` to trigger client packet/refresh path.
- This channel is suitable for low-frequency authoritative updates.

### C) Custom packet sync (complex/high-frequency data)

- Use mod networking for payloads that do not fit update-tag/update-packet semantics.
- Typical cases: GUI streams, progress bars, batched arrays, high-frequency deltas.
- Keep payloads minimal and versioned by message type; perform server authority checks on receive.

## 6) BlockEntityRenderer (BER) Registration

### Version map

| Loader | Registration path | Client lifecycle |
|---|---|---|
| Forge 1.20.1 | `EntityRenderersEvent.RegisterRenderers` then `event.registerBlockEntityRenderer(...)` | Mod event bus, client side |
| NeoForge 1.21.1 | `EntityRenderersEvent.RegisterRenderers` (`event.registerBlockEntityRenderer(...)`) or direct `BlockEntityRenderers.register(...)` / `EntityRenderers.register(...)` where applicable | Mod event bus or client bootstrap |

- BER code is client-only.
- BER must not perform server-world mutations.
- Render output should depend on synchronized state only.

## 7) Common Failure Modes

- Missing `setChanged()`: data appears to work in-session but is lost on save/reload.
- Missing `sendBlockUpdated(...)`: server state changes but client visuals stay stale.
- Side confusion: server-only logic executed in renderer or client tick path.
- Over-syncing: sending full tags every tick causes bandwidth and render jitter.
- Invalid type gating in `getTicker(...)`: crashes from wrong ticker cast.
- Persistence drift across versions: using `load` in 1.21.1 instead of `loadAdditional` patterns.

## 8) MCP Verification Queries

Use these MCP queries to validate API presence and signatures before implementation.

### BlockEntity core signatures

```json
{
  "method": "get_class_detail",
  "params": {
    "version": "1.20.1",
    "class_name": "BlockEntity"
  }
}
```

Repeat with `"version": "1.21.1"` to validate the 1.21.1 signature set.

### Sync and packet pattern checks

```json
{
  "method": "search_methods",
  "params": {
    "version": "1.20.1",
    "query": "getUpdateTag handleUpdateTag ClientboundBlockEntityDataPacket.create sendBlockUpdated"
  }
}
```

Repeat with `"version": "1.21.1"` to confirm the HolderLookup-based handshake.

### Renderer registration checks

```json
{
  "method": "search_methods",
  "params": {
    "version": "1.20.1",
    "query": "EntityRenderersEvent.RegisterRenderers registerBlockEntityRenderer"
  }
}
```

Repeat with `"version": "1.21.1"` and query `EntityRenderersEvent.RegisterRenderers BlockEntityRenderers.register EntityRenderers.register`.
