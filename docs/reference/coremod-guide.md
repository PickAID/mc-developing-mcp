# Coremod Guide: Mixin, MixinExtras, Access Transformers, JS Coremods

Coremods are low-level bytecode transformation tools that let you modify vanilla Minecraft (and other mod) classes at runtime. Use them when no event hook or API covers what you need.

---

## 1. Choosing the Right Tool

| Goal | Tool |
|---|---|
| Inject code at method entry or exit | `@Inject` (Mixin) |
| Make a private field/method public | Access Transformer |
| Expose a private field as a getter | `@Accessor` / `@Invoker` (Mixin) |
| Replace an entire method body | `@Overwrite` (Mixin) |
| Intercept a specific method call inside a method | `@Redirect` (Mixin) |
| Modify one argument of a method call | `@ModifyArg` (Mixin) |
| Add/change a local variable mid-method | `@ModifyVariable` / `@Local` (MixinExtras) |
| Wrap a method call with a conditional | `@WrapWithCondition` (MixinExtras) |
| Wrap a method call entirely (replace & call original) | `@WrapOperation` (MixinExtras) |
| Change the return value of a call site | `@ModifyExpressionValue` (MixinExtras) |
| Change what a method returns | `@ModifyReturnValue` (MixinExtras) |
| Low-level ASM/bytecode surgery | JS Coremod |

**Priority order** (least to most invasive): AT → Accessor/Invoker → @Inject → MixinExtras → @Redirect/@ModifyArg → @Overwrite → JS Coremod.

---

## 2. Mixin Basics

Mixin lets you inject code into existing classes without modifying them directly.

### Setup (build.gradle / neoforge.mods.toml)

```groovy
// build.gradle — mixin is a compile dep in NeoForge/Forge
dependencies {
    annotationProcessor "org.spongepowered:mixin:0.8.7:processor"
}
```

```toml
# META-INF/neoforge.mods.toml (NeoForge 1.21.1)
[[mixins]]
config = "yourmod.mixins.json"
```

### mixins.json

```json
{
  "required": true,
  "minVersion": "0.8",
  "package": "com.yourmod.mixin",
  "compatibilityLevel": "JAVA_17",
  "mixins": ["MixinLivingEntity"],
  "client": ["client.MixinGameRenderer"],
  "injectors": {
    "defaultRequire": 1
  }
}
```

### Mixin class structure

```java
@Mixin(LivingEntity.class)           // Target class
public abstract class MixinLivingEntity extends Entity {

    @Shadow  // Reference existing field (read/write)
    private float lastHurt;

    @Shadow  // Reference existing method (call it)
    public abstract float getHealth();

    // Your injections go here...
}
```

### @Shadow

`@Shadow` declares a reference to an existing member in the target class. It does not inject code — it lets your mixin code reference members that otherwise wouldn't compile.

```java
@Shadow private int foodLevel;           // field shadow
@Shadow public abstract void heal(float amount);  // method shadow (must be abstract)
@Shadow @Final private Level level;     // final field (use @Final to suppress warnings)
```

---

## 3. @Inject — Injecting Code

`@Inject` runs your code at a specific point in an existing method.

### Signature

```java
@Inject(method = "methodName(Larg/Type;)V", at = @At("HEAD"), cancellable = false)
private void onMethodName(ArgType arg, CallbackInfo ci) {
    // your code
}
```

- `method`: method descriptor. For overloaded methods, include the full descriptor.
- `at`: injection point (see §4).
- `cancellable = true`: allows calling `ci.cancel()` to stop the original method.
- Return type methods use `CallbackInfoReturnable<ReturnType>`.

### CallbackInfo / CallbackInfoReturnable

```java
// Void method — cancel it:
@Inject(method = "hurt", at = @At("HEAD"), cancellable = true)
private void onHurt(DamageSource source, float amount, CallbackInfo ci) {
    if (source.is(DamageTypes.CACTUS)) {
        ci.cancel();  // Skip the original method entirely
    }
}

// Return method — read or override return value:
@Inject(method = "getMaxHealth", at = @At("RETURN"), cancellable = true)
private void onGetMaxHealth(CallbackInfoReturnable<Float> cir) {
    cir.setReturnValue(cir.getReturnValue() * 2.0f);  // Double max health
}
```

### Targeting overloaded methods

```java
// Use full descriptor to disambiguate
@Inject(method = "addEffect(Lnet/minecraft/world/effect/MobEffectInstance;Lnet/minecraft/world/entity/Entity;)Z",
        at = @At("HEAD"))
private void onAddEffect(MobEffectInstance effect, Entity source, CallbackInfoReturnable<Boolean> cir) { ... }
```

---

## 4. Injection Points (@At)

The `@At` annotation specifies WHERE in the method body the injection runs.

| Value | Description |
|---|---|
| `HEAD` | First instruction of the method (before any existing code) |
| `RETURN` | Before each `return` statement (one injection per return) |
| `TAIL` | Before the final `return` statement only |
| `INVOKE` | Before or after a specific method call |
| `INVOKE_ASSIGN` | After a method call that assigns to a variable |
| `FIELD` | Before field read or write |
| `NEW` | Before `new Type(...)` constructor call |
| `JUMP` | Before a conditional jump (branch) |
| `CONSTANT` | At a literal constant value |

### INVOKE targeting

```java
@Inject(method = "tick", at = @At(
    value = "INVOKE",
    target = "Lnet/minecraft/world/level/Level;isClientSide()Z",
    shift = At.Shift.AFTER   // inject AFTER the call (BEFORE is default)
))
private void afterIsClientSideCheck(CallbackInfo ci) { ... }
```

### FIELD targeting

```java
@Inject(method = "tick", at = @At(
    value = "FIELD",
    target = "Lnet/minecraft/world/entity/LivingEntity;noActionTime:I",
    opcode = Opcodes.PUTFIELD  // GETFIELD or PUTFIELD
))
private void onNoActionTimeWrite(CallbackInfo ci) { ... }
```

### @Slice — narrowing the search range

When a method has multiple INVOKE targets that match, use `@Slice` to constrain the search:

```java
@Inject(method = "tick",
    slice = @Slice(
        from = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/Entity;tick()V"),
        to   = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;aiStep()V")
    ),
    at = @At("HEAD"))
private void onTickSlice(CallbackInfo ci) { ... }
```

---

## 5. @Overwrite — Replacing a Method

`@Overwrite` completely replaces the target method. **Use sparingly** — other mods cannot inject into an overwritten method.

```java
@Overwrite
public float getArmorValue() {
    // Your replacement implementation
    return 20.0f;
}
```

Always document why `@Overwrite` is necessary and what it replaces.

---

## 6. @Redirect — Replacing a Specific Call

`@Redirect` replaces a single method call inside a method. Your method receives the original arguments plus the object the call was on (as the first parameter for instance methods).

```java
// Replace Entity.hurt() call inside LivingEntity.tick()
@Redirect(
    method = "tick",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/Entity;hurt(Lnet/minecraft/world/damagesource/DamageSource;F)Z")
)
private boolean redirectHurt(Entity entity, DamageSource source, float amount) {
    // You decide what happens instead of the original hurt() call
    if (amount > 10.0f) {
        return entity.hurt(source, amount * 0.5f);
    }
    return entity.hurt(source, amount);
}
```

---

## 7. @ModifyArg — Changing One Argument

`@ModifyArg` intercepts a method call and lets you change one argument before it runs.

```java
// Modify the 'amount' arg passed to hurt()
@ModifyArg(
    method = "applyDamage",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;hurt(Lnet/minecraft/world/damagesource/DamageSource;F)Z"),
    index = 1  // 0=DamageSource, 1=float amount
)
private float modifyDamageAmount(float amount) {
    return amount * 0.5f;
}
```

`index` is the 0-based parameter index in the target method's parameter list. For instance methods, the implicit `this` is NOT counted.

### @ModifyArgs — Changing Multiple Arguments

```java
@ModifyArgs(
    method = "...",
    at = @At(value = "INVOKE", target = "...")
)
private void modifyArgs(Args args) {
    args.set(0, newDamageSource);
    args.set(1, (float) args.get(1) * 2.0f);
}
```

---

## 8. @ModifyVariable — Changing a Local Variable

`@ModifyVariable` intercepts a local variable (field or stack value) and lets you change it.

```java
@ModifyVariable(
    method = "hurt",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;getDamageAfterArmorAbsorb(...)F", shift = At.Shift.AFTER),
    ordinal = 0  // first float local after the point
)
private float modifyArmorDamage(float damage) {
    return damage * 0.75f;
}
```

Use `ordinal` to select which local of the right type to target (0-based, counting only that type). Use `MixinExtras @Local` for more precise targeting.

---

## 9. @Accessor and @Invoker — Interface Mixins

Use `@Accessor` and `@Invoker` when you need to read/write private fields or call private methods from outside the class (without making them public via AT).

### @Accessor (field access)

```java
@Mixin(LivingEntity.class)
public interface LivingEntityAccessor {
    @Accessor("noActionTime")
    int getNoActionTime();

    @Accessor("noActionTime")
    void setNoActionTime(int value);
}

// Usage: ((LivingEntityAccessor) entity).getNoActionTime()
```

### @Invoker (method invocation)

```java
@Mixin(LivingEntity.class)
public interface LivingEntityInvoker {
    @Invoker("getDamageAfterArmorAbsorb")
    float invokeDamageAfterArmorAbsorb(DamageSource source, float damage);
}

// Usage: ((LivingEntityInvoker) entity).invokeDamageAfterArmorAbsorb(src, 5.0f)
```

These are interface mixins — the mixin class is an `interface`, not a class.

---

## 10. Local Capture

To access local variables inside a method body (not just parameters), use local capture.

```java
// In @Inject: add LocalCapture enum + extra params matching locals
@Inject(method = "hurt",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;isSleeping()Z"),
    locals = LocalCapture.CAPTURE_FAILHARD)  // or CAPTURE_FAILSOFT / PRINT
private void onHurtWithLocal(DamageSource source, float amount, CallbackInfo ci,
        boolean flag, float f, float f1) {  // extra params = captured locals in order
    // f1 is some local float computed before this point
}
```

Use `LocalCapture.PRINT` during development to print the local variable table so you know what to capture.

---

## 11. Mixin Conflict Resolution

When two mixins inject into the same method:
- `@Inject` at the same point: both run, order is undefined.
- Use `priority` on the `@Mixin` annotation to set order (higher = later).

```java
@Mixin(value = LivingEntity.class, priority = 1100)  // default is 1000
public class MyHighPriorityMixin { ... }
```

Use `require = N` on injections to assert that the injection matched N times:
```java
@Inject(method = "tick", at = @At("HEAD"), require = 1)
```

---

## 12. MixinExtras Annotations

MixinExtras (by LlamaLad7) provides higher-level alternatives that are safer and more composable than raw Mixin operations.

**Add dependency**: already bundled with NeoForge 20.4+ and Forge 47.1+. For older: shade it.

### @WrapWithCondition — Conditionally Skip a Call

```java
import com.llamalad7.mixinextras.injector.WrapWithCondition;

@WrapWithCondition(
    method = "tick",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;decrementNoActionTime()V")
)
private boolean shouldDecrementNoActionTime(LivingEntity entity) {
    return !entity.isInWater();  // skip the call if in water
}
```

Returns `boolean` — `false` skips the original call.

### @ModifyExpressionValue — Change a Value at a Call Site

Intercepts a method call's return value (without replacing the call itself):

```java
import com.llamalad7.mixinextras.injector.ModifyExpressionValue;

@ModifyExpressionValue(
    method = "hurt",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;getArmorValue()I")
)
private int modifyArmorValue(int original) {
    return original + 5;
}
```

### @ModifyReturnValue — Change What a Method Returns

```java
import com.llamalad7.mixinextras.injector.ModifyReturnValue;

@ModifyReturnValue(method = "getMaxHealth", at = @At("RETURN"))
private float onGetMaxHealth(float original) {
    return original + 20.0f;
}
```

Much cleaner than `@Inject` + `cir.setReturnValue()`.

### @WrapOperation — Wrap or Replace a Call

Full control: you receive the original lambda and decide whether/how to call it.

```java
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;

@WrapOperation(
    method = "tick",
    at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;aiStep()V")
)
private void wrapAiStep(LivingEntity entity, Operation<Void> original) {
    if (someCondition) {
        original.call(entity);  // call the original
    }
    // or: modify args, call twice, skip entirely, etc.
}
```

### @Local — Precise Local Variable Access

```java
import com.llamalad7.mixinextras.sugar.Local;

@Inject(method = "hurt", at = @At(value = "INVOKE", target = "..."))
private void onHurt(DamageSource source, float amount, CallbackInfo ci,
        @Local(name = "f1") float armorDamage,
        @Local(ordinal = 0, type = LocalType.VAR) int someInt) {
    // access locals by name (if MCP/yarn mappings) or ordinal+type
}
```

### @Share — Share a Value Across Injection Points

```java
import com.llamalad7.mixinextras.sugar.Share;
import com.llamalad7.mixinextras.sugar.ref.LocalRef;

@Inject(method = "hurt", at = @At("HEAD"))
private void captureOriginal(DamageSource src, float amount, CallbackInfo ci,
        @Share("originalAmount") LocalFloatRef originalAmount) {
    originalAmount.set(amount);
}

@Inject(method = "hurt", at = @At("RETURN"))
private void useOriginal(DamageSource src, float amount, CallbackInfo ci,
        @Share("originalAmount") LocalFloatRef originalAmount) {
    float orig = originalAmount.get();
    // use orig here
}
```

---

## 13. Access Transformers

ATs change the visibility of a class, field, or method — no bytecode surgery, no injection. Prefer ATs when you only need access, not behavior change.

### Setup

```toml
# META-INF/neoforge.mods.toml (NeoForge)
[[accessTransformers]]
file = "META-INF/accesstransformer.cfg"
```

```gradle
// build.gradle (Forge 1.20.1)
minecraft {
    accessTransformer = file('src/main/resources/META-INF/accesstransformer.cfg')
}
```

### AT file format

```
# Comment
<access modifier> <fully.qualified.ClassName> [member descriptor]

# Make a class public
public net.minecraft.world.entity.LivingEntity

# Make a field public (use SRG/MCP name — obf name in production)
public net.minecraft.world.entity.LivingEntity f_20775_           # lastHurt

# Make a field public+non-final (remove final modifier)
public-f net.minecraft.world.entity.LivingEntity f_20775_

# Make a method public
public net.minecraft.world.entity.LivingEntity m_6469_()V         # tick()

# Override access to protected
protected net.minecraft.world.entity.LivingEntity f_20775_

# Remove final only (keep current access)
public+f net.minecraft.world.entity.Entity f_19803_               # note: +f keeps final, use -f to remove
```

### Access modifiers

| Modifier | Effect |
|---|---|
| `public` | Make public |
| `protected` | Make protected |
| `private` | Make private (rare) |
| `public-f` | Make public AND remove final |
| `protected-f` | Make protected AND remove final |
| `-f` (suffix) | Remove final from current access |

### Finding SRG names

In development (MCP/Yarn/Parchment mappings), you use human-readable names. In production, the game is obfuscated. The AT engine handles remapping automatically at build time. In your AT file, use the **mapped** (deobfuscated) names you see in your IDE.

---

## 14. JavaScript Coremods (NeoForge/Forge)

JS Coremods run at class loading time using the Nashorn/GraalVM JS engine. They provide direct ASM bytecode manipulation.

### When to use JS Coremods over Mixin

- Need to transform code before Mixin even runs
- Mixin's injection model can't express what you need
- Performance-critical: avoid Mixin overhead for hot paths
- Transforming classes that Mixin can't target (early boot, non-MC classes)

### Setup (NeoForge 1.21.1)

```json
// META-INF/coremods.json
{
  "MyTransformer": "coremods/my_transformer.js"
}
```

```toml
# META-INF/neoforge.mods.toml
[[coreMods]]
coremod = "com.yourmod.YourCoreMod"  # optional IModTransformer Java class
```

For pure JS coremods, just the `coremods.json` is needed.

### JS Coremod file structure

```javascript
// src/main/resources/coremods/my_transformer.js
var ASMAPI = Java.type('net.minecraftforge.coremod.api.ASMAPI');
var Opcodes = Java.type('org.objectweb.asm.Opcodes');
var InsnNode = Java.type('org.objectweb.asm.tree.InsnNode');
var MethodInsnNode = Java.type('org.objectweb.asm.tree.MethodInsnNode');
var VarInsnNode = Java.type('org.objectweb.asm.tree.VarInsnNode');

function initializeCoreMod() {
    return {
        'MyTransformer': {
            'target': {
                'type': 'METHOD',
                'class': 'net.minecraft.world.entity.LivingEntity',
                'methodName': 'm_6469_',   // tick() — use SRG name
                'methodDesc': '()V'
            },
            'transformer': function(method) {
                var iter = method.instructions.iterator();
                while (iter.hasNext()) {
                    var insn = iter.next();
                    // Check for a specific instruction
                    if (insn.getOpcode() === Opcodes.RETURN) {
                        // Insert before the RETURN
                        method.instructions.insertBefore(insn,
                            new MethodInsnNode(Opcodes.INVOKESTATIC,
                                'com/yourmod/hooks/LivingEntityHooks',
                                'onTick',
                                '(Lnet/minecraft/world/entity/LivingEntity;)V',
                                false));
                        method.instructions.insertBefore(insn,
                            new VarInsnNode(Opcodes.ALOAD, 0));  // push 'this'
                    }
                }
                return method;
            }
        }
    };
}
```

### ASMAPI helpers

```javascript
// NeoForge ASMAPI utilities
var ASMAPI = Java.type('net.minecraftforge.coremod.api.ASMAPI');

// Find a method call node
var target = ASMAPI.findFirstMethodCall(method,
    ASMAPI.MethodType.VIRTUAL,
    'net/minecraft/world/entity/LivingEntity',
    'm_21051_',   // getHealth()
    '()F');

// Get mapped name (SRG → mapped in dev)
var mappedName = ASMAPI.mapMethod('m_6469_');

// Insert list of insns
ASMAPI.insertInsnList(method, target, insnList, ASMAPI.InsertMode.INSERT_BEFORE);
```

### Target types

```javascript
// METHOD transformer
'target': { 'type': 'METHOD', 'class': '...', 'methodName': '...', 'methodDesc': '...' }

// CLASS transformer (operates on ClassNode)
'target': { 'type': 'CLASS', 'class': 'net.minecraft.world.entity.LivingEntity' }

// FIELD transformer
'target': { 'type': 'FIELD', 'class': '...', 'fieldName': '...', 'fieldDesc': '...' }
```

### Caveats

- JS coremods run during class loading; you cannot use most game APIs.
- Use SRG names (obfuscated) for method/field descriptors since production is obfuscated.
- In dev, ASMAPI.mapMethod/mapField will resolve to the human-readable name.
- Rhino/Nashorn JS engines have ES5-only support; no arrow functions, no `const`/`let`.
- NeoForge 1.21.1 may use GraalJS — check your loader version.

---

## 15. Common Patterns and Pitfalls

### Pattern: Cancel an event from a Mixin

```java
@Inject(method = "hurt", at = @At("HEAD"), cancellable = true)
private void onHurt(DamageSource source, float amount, CallbackInfo ci) {
    if (source.is(DamageTypes.FALL) && this.hasEffect(MobEffects.SLOW_FALLING)) {
        ci.cancel();
    }
}
```

### Pattern: Modify return value cleanly (MixinExtras preferred)

```java
// PREFER this (MixinExtras):
@ModifyReturnValue(method = "getSpeed", at = @At("RETURN"))
private float onGetSpeed(float original) { return original * 1.5f; }

// AVOID this (verbose):
@Inject(method = "getSpeed", at = @At("RETURN"), cancellable = true)
private void onGetSpeed(CallbackInfoReturnable<Float> cir) { cir.setReturnValue(cir.getReturnValue() * 1.5f); }
```

### Pattern: Add interface to vanilla class

```java
@Mixin(LivingEntity.class)
public abstract class MixinLivingEntity implements IMyInterface {
    // Implement IMyInterface methods here
    @Override
    public void myMethod() { ... }
}
```

Cast vanilla entity to `IMyInterface` anywhere you need to call `myMethod()`.

### Pitfall: Wrong method descriptor

The method string `"hurt"` may match multiple methods. Always use the full descriptor when targeting overloaded methods:
```java
// Correct:
@Inject(method = "hurt(Lnet/minecraft/world/damagesource/DamageSource;F)Z", ...)
// Fragile (may match wrong overload):
@Inject(method = "hurt", ...)
```

### Pitfall: Mixin not applied

Check `mixins.json` — is the class listed in the right array (`mixins` vs `client`)? Client-only mixins must be in `client` array and the class must be in `com.yourmod.mixin.client` or similar package.

### Pitfall: @Shadow on final field

Add `@Final` alongside `@Shadow` to suppress the mixin processor warning. You can shadow final fields but cannot reassign them.

### Pitfall: AT not taking effect

The AT file must be declared in `neoforge.mods.toml` (NeoForge) or `build.gradle` (Forge). In dev it works immediately; in prod it is applied at jar-signing time. Verify the AT config reference matches the actual file path.

---

## 16. Debugging Coremods

- **Mixin verbose logging**: Add `-Dmixin.debug.verbose=true -Dmixin.debug.export=true` JVM args. Exported classes land in `.mixin.out/`.
- **LocalCapture.PRINT**: Temporarily use this to dump the local variable table to console.
- **Mixin audit log**: `-Dmixin.debug.countInjections=true` shows how many injections matched per target.
- **ASM bytecode viewer**: Use IntelliJ's "ASM Bytecode Viewer" plugin on the target class to see the actual instruction list before writing an injection point.
- **JS Coremod**: `print("debug info")` in JS coremods writes to the log. Wrap transformers in try/catch to get meaningful errors.

---

## 17. Version Notes (1.20.1 vs 1.21.1)

| Topic | 1.20.1 (Forge) | 1.21.1 (NeoForge) |
|---|---|---|
| Mixin version | 0.8.5 | 0.8.7+ |
| MixinExtras | Bundled in Forge 47.1+ | Bundled in NeoForge 20.4+ |
| AT declaration | `build.gradle` `accessTransformer =` | `neoforge.mods.toml` `[[accessTransformers]]` |
| JS Coremods | `META-INF/coremods.json` | `META-INF/coremods.json` (same) |
| SRG names | Use `m_XXXXXX_` / `f_XXXXXX_` | Same SRG names in 1.21.1 |
| JS engine | Nashorn (Java 11) | GraalJS or Nashorn depending on build |
| `@WrapOperation` | MixinExtras 0.3+ | MixinExtras 0.4+ (auto-bundled) |
