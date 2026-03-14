# Third-Party Library Quick Reference

The system indexes 17 third-party libraries. These are version-isolated and accessible via standard MCP methods by specifying the appropriate loader name.

## Library Index

### Architectury API
Cross-loader abstraction layer.
- Versions: 1.20.1, 1.21.1
- Key package: dev.architectury.*
- Entry points: BiomeModifications, BlockEntityRendererRegistry, Platform-related classes
- MCP loader name: architectury

### Caelus
Elytra flight API.
- Versions: 1.20.1, 1.21.1
- Key package: top.theillusivec4.caelus.api
- Entry points: CaelusApi
- MCP loader name: caelus

### Citadel
Entity model/animation framework.
- Versions: 1.20.1, 1.21.1
- Key package: com.github.alexthe666.citadel.*
- Entry points: AdvancedEntityModel, AdvancedModelBox, BasicEntityModel
- MCP loader name: citadel

### Cloth Config
Config screen API.
- Versions: 1.20.1, 1.21.1
- Key package: me.shedaniel.clothconfig2.api
- Entry points: AbstractConfigEntry, AbstractConfigListEntry, ConfigBuilder
- MCP loader name: cloth-config

### Create
Kinetic/mechanical mod. Largest third-party library (~2000 files per version).
- Versions: 1.20.1, 1.21.1
- Key package: com.simibubi.create.*
- Entry points: AllConfigs, AllCreativeModeTabs, AllBlocks (via AllPartialModels)
- MCP loader name: create

### Curios
Equipment slot API.
- Versions: 1.20.1, 1.21.1
- Key package: top.theillusivec4.curios.api
- Entry points: CuriosApi, CuriosHelper, CuriosConfig
- MCP loader name: curios

### FTB Library
FTB team utility library.
- Versions: 1.20.1 (limited), 1.21.1
- Key package: dev.ftb.mods.ftblibrary.*
- Entry points: ConfigGroup, ConfigFromString, ClientUtils
- MCP loader name: ftb-library

### GeckoLib
Animation/rendering engine.
- Versions: 1.20.1, 1.21.1
- Key package: software.bernie.geckolib.*
- Entry points: BakedGeoModel, GeoModel (abstract), GeoRenderer, AnimatableManager
- MCP loader name: geckolib

### GuideME
In-game guide framework (from AE2).
- Versions: 1.20.1, 1.21.1
- Key package: guideme.*
- Entry points: Various factory/definition classes for markup
- MCP loader name: guideme

### LDLib
Low Drag MC utility library (1.20.1).
- Versions: 1.20.1 only
- Key package: com.lowdragmc.lowdraglib.*
- Entry points: BlockEntityUIFactory, various configurators
- MCP loader name: ldlib

### LDLib2
Low Drag MC utility library v2 (1.21.1).
- Versions: 1.21.1 only
- Key package: com.lowdragmc.lowdraglib.*
- Entry points: Same pattern as LDLib, updated APIs
- MCP loader name: ldlib2

### MidnightLib
Cross-platform config/utility.
- Versions: 1.20.1, 1.21.1
- Key package: eu.midnightdust.lib.*
- Entry points: MidnightConfig, PlatformFunctions
- MCP loader name: midnightlib

### Mixin
Bytecode manipulation framework (version-agnostic).
- Version: third_party / mixin
- Key package: org.spongepowered.asm.mixin.*
- Entry points: @Mixin, @Inject, @Shadow, @Redirect, MixinBootstrap
- MCP version: third_party, loader: mixin

### MixinExtras
Extended Mixin functionality (version-agnostic).
- Version: third_party / mixinextras (+ forge/neoforge variants)
- Key package: com.llamalad7.mixinextras.*
- Entry points: @WrapOperation, @ModifyExpressionValue, @Local
- MCP versions: third_party, loaders: mixinextras, mixinextras-forge, mixinextras-neoforge

### Multiblocked2
Multiblock machine framework.
- Versions: 1.20.1, 1.21.1
- Key package: com.lowdragmc.mbd2.*
- Entry points: ConfigHolder, ClientProxy, various trait definitions
- MCP loader name: multiblocked2

### Photon
Particle effects engine.
- Versions: 1.20.1, 1.21.1
- Key package: com.lowdragmc.photon.*
- Entry points: BeamConfig, BlendMode, ClientCommands, emitter classes
- MCP loader name: photon

### Registrate
Registration helper (Create ecosystem).
- Versions: 1.20.1 only
- Key package: com.tterrag.registrate.*
- Entry points: AbstractBuilder, BlockBuilder, ItemBuilder, Registrate main class
- MCP loader name: registrate

### YACL (YetAnotherConfigLib)
Config screen library.
- Versions: 1.20.1 only
- Key package: dev.isxander.yacl3.*
- Entry points: BooleanControllerBuilder, CodecConfig, AbstractConfigEntry
- MCP loader name: yacl

## How to Query

Use the standard MCP methods with the appropriate loader name:

```
find_class(version="1.20.1", loader="geckolib", class_name="GeoModel")
get_class_detail(version="1.20.1", loader="create", class_name="AllBlocks")
search(version="1.21.1", loader="curios", query="slot register")
```

## File Counts

| Library | 1.20.1 | 1.21.1 | third_party |
|---------|--------|--------|-------------|
| Architectury | ~500 | ~500 | - |
| Caelus | ~10 | ~10 | - |
| Citadel | ~150 | ~150 | - |
| Cloth Config | ~200 | ~200 | - |
| Create | ~2000 | ~2000 | - |
| Curios | ~100 | ~100 | - |
| FTB Library | ~50 | ~150 | - |
| GeckoLib | ~300 | ~300 | - |
| GuideME | ~50 | ~50 | - |
| LDLib | ~400 | - | - |
| LDLib2 | - | ~450 | - |
| MidnightLib | ~30 | ~30 | - |
| Mixin | - | - | ~250 |
| MixinExtras | - | - | ~100 |
| Multiblocked2 | ~300 | ~300 | - |
| Photon | ~100 | ~100 | - |
| Registrate | ~150 | - | - |
| YACL | ~150 | - | - |
