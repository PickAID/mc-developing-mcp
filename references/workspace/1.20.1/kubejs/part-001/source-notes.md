# Source Notes - Part 001 (Pilot Corpus)

## Source Verification Results

**Version:** 1.20.1
**Loader:** KubeJS
**Source Root:** `/Users/agenthome/mc-code-exports/1.20.1/kubejs/sources/`

### Coverage Summary

| Category | Files | Status |
|----------|-------|--------|
| Events | 22 | ✓ Verified |
| Builders | 53 | ✓ Verified |
| Entities/Core | 104 | ✓ Verified |
| Registry | 7 | ✓ Verified |
| Other | ~492 | ✓ Verified |

**Total:** 678 Java files (matches expected count)

### Key Source Files

#### Events
- `bindings/event/ServerEvents.java` - Server-side events (recipes, commands, loot tables)
- `bindings/event/ClientEvents.java` - Client-side events (init, tick, rendering)
- `bindings/event/StartupEvents.java` - Startup events
- `bindings/event/PlayerEvents.java` - Player events (login, logout, respawn)
- `bindings/event/BlockEvents.java` - Block events (break, place)
- `bindings/event/ItemEvents.java` - Item events (crafted, smelted)
- `bindings/event/EntityEvents.java` - Entity events
- `bindings/event/WorldgenEvents.java` - World generation events

#### Builders
- `misc/BlockBuilder.java` - Block creation
- `misc/ItemBuilder.java` - Item creation
- `misc/FluidBuilder.java` - Fluid creation
- `misc/EntityTypeBuilder.java` - Entity type creation

#### Entities (Core API)
- `core/EntityKJS.java` - Base entity API
- `core/PlayerKJS.java` - Player-specific API
- `core/LivingEntityKJS.java` - Living entity API
- `core/ItemStackKJS.java` - Item stack API

### Source Path Structure
```
dev/latvian/mods/kubejs/
├── bindings/
│   ├── event/          # Event groups
│   └── *.java          # Wrapper classes
├── core/               # Entity APIs
├── misc/               # Builders
├── recipe/             # Recipe events
├── server/             # Server events
├── loot/               # Loot table events
└── registry/           # Registry helpers
```

### Known Limitations (from existing docs)
1. `WorldgenEvents.add*` features are hard-disabled in 1.20.1 - logs error at runtime
2. `EntityTypeBuilder` and `BiomeBuilder` classes are NOT present in this source snapshot
3. Worldgen structure registration APIs not exposed in AddWorldgenEventJS/RemoveWorldgenEventJS

### QA Notes
- Source verification complete - all expected directories present
- Java file count matches manifest expectation
- Key event classes confirmed with exact event names
- Ready for chunk generation
