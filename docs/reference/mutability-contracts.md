# Mutability Contracts Reference

Mutability defines whether an event property can be changed by the handler. A property is mutable if it has a corresponding setter method. If only a getter exists, the property is read-only.

## 1.20.1

### KubeJS
| Event Class | Property | Getter | Setter | Mutable? |
|---|---|---|---|---|
| LivingEntityHurtEventJS | damage | `getDamage()` → float | NONE | NO |

### Forge
| Event Class | Property | Getter | Setter | Mutable? |
|---|---|---|---|---|
| LivingHurtEvent | amount | `getAmount()` → float | `setAmount(float)` | YES |
| LivingDamageEvent | amount | `getAmount()` → float | `setAmount(float)` | YES |
| LivingAttackEvent | amount | `getAmount()` → float | NONE | NO |
| LivingHealEvent | amount | `getAmount()` → float | `setAmount(float)` | YES |
| LivingFallEvent | damageMultiplier | `getDamageMultiplier()` → float | `setDamageMultiplier(float)` | YES |
| LivingDrownEvent | damageAmount | `getDamageAmount()` → float | `setDamageAmount(float)` | YES |
| CriticalHitEvent | damageModifier | `getDamageModifier()` → float | `setDamageModifier(float)` | YES |
| ShieldBlockEvent | blockedDamage | `getBlockedDamage()` → float | `setBlockedDamage(float)` | YES |
| EntityTeleportEvent | attackDamage | `getAttackDamage()` → float | `setAttackDamage(float)` | YES |

> [!CAUTION]
> **Critical Warning: 1.20.1 KubeJS Damage Mutation Trap**
> LivingEntityHurtEventJS.getDamage() exists but there is NO setDamage(). To mutate damage in 1.20.1, use ForgeEvents.onEvent("net.minecraftforge.event.entity.living.LivingHurtEvent", handler) with event.setAmount() in startup_scripts only.

## 1.21.1

### KubeJS
| Event Class | Property | Getter | Setter | Mutable? |
|---|---|---|---|---|
| BeforeLivingEntityHurtKubeEvent | damage | `getDamage()` → float | `setDamage(float)` | YES |
| AfterLivingEntityHurtKubeEvent | damage | `getDamage()` → float | NONE | NO |

### NeoForge
| Event Class | Property | Getter | Setter | Mutable? |
|---|---|---|---|---|
| LivingIncomingDamageEvent | amount | `getAmount()` → float | `setAmount(float)` | YES |
| LivingIncomingDamageEvent | originalAmount | `getOriginalAmount()` → float | NONE | NO |
| LivingDamageEvent | newDamage | `getNewDamage()` → float | `setNewDamage(float)` | YES |
| LivingDamageEvent | originalDamage | `getOriginalDamage()` → float | NONE | NO |
| ArmorHurtEvent | newDamage(slot) | `getNewDamage(slot)` → Float | `setNewDamage(slot, float)` | YES |
| LivingShieldBlockEvent | blockedDamage | `getBlockedDamage()` → float | `setBlockedDamage(float)` | YES |
| LivingFallEvent | damageMultiplier | `getDamageMultiplier()` → float | `setDamageMultiplier(float)` | YES |
| CriticalHitEvent | damageMultiplier | `getDamageMultiplier()` → float | `setDamageMultiplier(float)` | YES |

## Verification Workflow

1. Run `get_class_detail(version, loader, "EventClassName")` to retrieve all methods.
2. Identify matching get*/set* pairs for the same property.
3. If a setter exists, the property is mutable. If only a getter exists, it is read-only.
4. Verify mutability in the specific version and loader context, as contracts can change across versions.
