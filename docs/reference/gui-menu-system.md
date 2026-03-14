# GUI/Menu System Architecture Reference

This document defines the Menu + Screen architecture for Forge 1.20.1 and NeoForge 1.21.1.
It focuses on contracts, invariants, and version-specific integration points.

## Core contract

The container system is valid only when all layers align:

1. Register a `MenuType`.
2. Implement `AbstractContainerMenu` with server and client constructors.
3. Register a matching `AbstractContainerScreen` on client side.
4. Open the menu from the logical server (`ServerPlayer`) only.

## Version differences

| Concern | Forge 1.20.1 | NeoForge 1.21.1 | Notes |
|---|---|---|---|
| Menu factory | `IForgeMenuType.create(...)` | `IMenuTypeExtension.create(...)` | Both produce network-aware `MenuType` factories |
| Deferred register key | `ForgeRegistries.MENU_TYPES` (or key form) | `Registries.MENU` / `BuiltInRegistries.MENU` | Holder API differs, contract is same |
| Screen binding | `MenuScreens.register(...)` in client setup | `RegisterMenuScreensEvent#register(...)` | NeoForge favors event-driven registration |
| Open menu | `NetworkHooks.openScreen(...)` | `ServerPlayer.openMenu(...)` overloads | Both must run on logical server |
| Extra data buffer | `FriendlyByteBuf` | `RegistryFriendlyByteBuf` | Used for `BlockPos`, ids, mode values |

## MenuType registration

### Forge 1.20.1

- Register in `DeferredRegister<MenuType<?>>`.
- Use `IForgeMenuType.create((id, inv, buf) -> new MyMenu(...))`.
- The factory path is the client reconstruction entry point.

```java
public static final RegistryObject<MenuType<MyMenu>> MY_MENU = MENUS.register(
    "my_menu",
    () -> IForgeMenuType.create((id, inv, buf) -> new MyMenu(id, inv, buf.readBlockPos()))
);
```

### NeoForge 1.21.1

- Register in `DeferredRegister<MenuType<?>>` with `Registries.MENU`.
- Use `IMenuTypeExtension.create((id, inv, buf) -> new MyMenu(...))`.
- In 1.21.1 corpus, this is the replacement for Forge's `IForgeMenuType` path.

```java
public static final Supplier<MenuType<MyMenu>> MY_MENU = MENUS.register(
    "my_menu",
    () -> IMenuTypeExtension.create((id, inv, buf) -> new MyMenu(id, inv, buf.readBlockPos()))
);
```

## `AbstractContainerMenu` implementation

### Constructor split

- **Server constructor**: binds authoritative container state (`BlockEntity`, handlers).
- **Client constructor**: decodes minimal sync identity from network buffer.
- Both constructors must build the exact same slot ordering.

### Slot management

- Use `addSlot` in deterministic order; indices are API, not incidental detail.
- For capability-backed inventories, use `SlotItemHandler` with `IItemHandler`.
- Recommended region order: machine/custom slots -> player inventory -> hotbar.

| Segment | Start | End | Count |
|---|---:|---:|---:|
| Tile/custom | 0 | `tileSlots - 1` | `tileSlots` |
| Player inventory | `tileSlots` | `tileSlots + 26` | 27 |
| Hotbar | `tileSlots + 27` | `tileSlots + 35` | 9 |

### `quickMoveStack`

- `quickMoveStack` is the shift-click transfer router.
- Route by region and call `moveItemStackTo` with exact bounds.
- Return copied original stack on successful move; `ItemStack.EMPTY` on failure.
- Missing implementation or wrong index bounds causes no-op, item loss, or dupes.

### `DataSlot` sync

- Use `addDataSlot` for integer state synchronization.
- Typical values: progress ticks, burn time, energy, mode id.
- `DataSlot` is int-only; split larger values when required.

### `stillValid`

- Gate menu lifetime with distance + block/state validity.
- If too permissive, players interact with stale or invalid server state.

## `AbstractContainerScreen` implementation

### `renderBg`

- Draw menu texture frame and static visual background.
- Use `leftPos` and `topPos` as origin for texture placement.
- Render progress overlays from synchronized `DataSlot` values.

### `renderLabels`

- Draw title and inventory labels as foreground text.
- Keep text coordinates stable relative to texture layout.

### Screen registration path

| Version | Registration point | Canonical pattern |
|---|---|---|
| Forge 1.20.1 | Client setup lifecycle | `MenuScreens.register(MY_MENU.get(), MyScreen::new)` |
| NeoForge 1.21.1 | `RegisterMenuScreensEvent` on mod bus | `event.register(MY_MENU.get(), MyScreen::new)` |

## Opening menus and extra data

### Server-side rule

- Open menus only from logical server (`ServerPlayer`).
- Client-side opening creates container id/state mismatches and crashes.

### Forge 1.20.1 open path

- Use `NetworkHooks.openScreen(serverPlayer, menuProvider)`.
- Use overloads with writer or `BlockPos` when extra client ctor data is needed.

### NeoForge 1.21.1 open path

- Use `serverPlayer.openMenu(menuProvider)` for no-extra-data menus.
- Use `serverPlayer.openMenu(menuProvider, BlockPos)` or writer overload for extras.
- Extra payload is consumed by factory/client constructor via `RegistryFriendlyByteBuf`.

### Data handoff constraints

- Send identifiers (`BlockPos`, entity id, mode enum id), not mutable inventories.
- Re-resolve server objects from identifiers and validate type before slot binding.

## Common pitfalls

- Opening UI on client side instead of server side.
- Slot index layout changed without updating `quickMoveStack` ranges.
- Omitted `quickMoveStack` implementation.
- Server/client constructors not producing identical slot graphs.
- Missing screen registration for a valid menu type.
- Using non-int state in `DataSlot` without splitting.

## MCP verification queries

Use these corpus checks to validate architecture assumptions.

```json
{
  "method": "search_classes",
  "params": { "query": "IForgeMenuType", "version": "1.20.1" }
}
```

```json
{
  "method": "search_methods",
  "params": { "query": "NetworkHooks.openScreen", "version": "1.20.1" }
}
```

```json
{
  "method": "search_classes",
  "params": { "query": "RegisterMenuScreensEvent", "version": "1.21.1" }
}
```

```json
{
  "method": "search_methods",
  "params": { "query": "openMenu(MenuProvider, Consumer<RegistryFriendlyByteBuf>)", "version": "1.21.1" }
}
```
