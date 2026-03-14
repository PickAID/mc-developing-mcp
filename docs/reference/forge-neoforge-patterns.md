# Forge vs NeoForge Patterns Reference

Minecraft 1.20.1 uses the MinecraftForge loader. Versions 1.20.4 and later use NeoForge. This document outlines the patterns for each.

## Event System Patterns

### 1.20.1 Forge
- **Packages**: `net.minecraftforge.event.*`, `net.minecraftforge.eventbus.api.*`
- **Event Bus**: `MinecraftForge.EVENT_BUS`
- **Subscriber**: Use `@SubscribeEvent` on methods.
- **Registration**: Use `@Mod.EventBusSubscriber` or call `EVENT_BUS.register()` manually.
- **Key Events**: `LivingHurtEvent`, `LivingDamageEvent`, `LivingAttackEvent`, `EntityJoinLevelEvent`.
- **Stats**: 666 files, 1,101 classes, 6,126 methods.

### 1.21.1 NeoForge
- **Packages**: `net.neoforged.neoforge.event.*`, `net.neoforged.bus.api.*`
- **Event Bus**: `NeoForge.EVENT_BUS`
- **Subscriber**: Use `@SubscribeEvent` on methods.
- **Registration**: Use `@EventBusSubscriber` or register manually.
- **Key Events**: `LivingIncomingDamageEvent` (replaces `LivingHurtEvent` pattern), `LivingDamageEvent` (restructured), `ArmorHurtEvent`.
- **Stats**: 951 files, 1,301 classes, 6,676 methods.

## Registration Patterns

### 1.20.1 Forge
- **Creation**: `DeferredRegister.create(ForgeRegistries.ITEMS, MOD_ID)`
- **Holder**: `RegistryObject<T>`
- **Static Injection**: `@ObjectHolder`

### 1.21.1 NeoForge
- **Creation**: `DeferredRegister.create(Registries.ITEM, MOD_ID)` (Uses `Registries` instead of `ForgeRegistries`)
- **Holder**: `DeferredHolder<T, R>` (replaces `RegistryObject`)
- **Note**: NeoForge encourages data-driven registration.

## Lifecycle Differences

### 1.20.1 Forge
- **Events**: `FMLCommonSetupEvent`, `FMLClientSetupEvent`, `FMLDedicatedServerSetupEvent`.
- **Cross-Mod**: Use `InterModComms`.

### 1.21.1 NeoForge
- **Events**: Same names, but located in `net.neoforged.fml.event.lifecycle`.
- **Cross-Mod**: `InterModComms` is deprecated or removed. Use the capability system or service loaders.

## KubeJS Integration Patterns

### 1.20.1
- **Pattern**: `ForgeEvents.onEvent("fully.qualified.EventClass", handler)` in `startup_scripts` only.
- **Access**: Directly accesses the Forge event bus.
- **Handler**: Receives raw Forge event objects (e.g., `event.getAmount()`, `event.setAmount()`).

### 1.21.1
- **Native Events**: KubeJS provides `EntityEvents.beforeHurt` and `EntityEvents.afterHurt` for damage.
- **NeoForge Access**: `NativeEvents` may provide access to the NeoForge event bus.

## Mixin and MixinExtras
- **Compatibility**: The same Mixin API works on both loaders.
- **MixinExtras**: Provides `@WrapOperation`, `@ModifyExpressionValue`, `@Local`, and `@WrapWithCondition`.
- **Queries**: Use `version="third_party"` for Mixin queries.

## Querying Forge vs NeoForge
Use the following MCP method examples to query the database for loader-specific patterns.

**Forge (1.20.1) Event Search:**
```json
{
  "method": "search_methods",
  "params": {
    "query": "LivingHurtEvent",
    "version": "1.20.1"
  }
}
```

**NeoForge (1.21.1) Event Search:**
```json
{
  "method": "search_methods",
  "params": {
    "query": "LivingIncomingDamageEvent",
    "version": "1.21.1"
  }
}
```
