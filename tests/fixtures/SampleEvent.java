package net.minecraftforge.event.entity.living;

import net.minecraftforge.eventbus.api.Event;
import net.minecraftforge.eventbus.api.Cancelable;

@Cancelable
public class LivingHurtEvent extends Event {

    private final float originalDamage;
    private float amount;

    public LivingHurtEvent(float originalDamage, float amount) {
        this.originalDamage = originalDamage;
        this.amount = amount;
    }

    public float getOriginalDamage() {
        return originalDamage;
    }

    public float getAmount() {
        return amount;
    }

    public void setAmount(float amount) {
        this.amount = amount;
    }
}
