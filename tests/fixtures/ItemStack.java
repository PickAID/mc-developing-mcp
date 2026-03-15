package net.minecraft.world.item;

import java.util.List;
import net.minecraft.world.entity.player.Player;

public class ItemStack implements java.io.Serializable {

    private final Item item;
    private int count;
    private net.minecraft.nbt.CompoundTag tag;

    public ItemStack(Item item) {
        this(item, 1);
    }

    public ItemStack(Item item, int count) {
        this.item = item;
        this.count = count;
    }

    public Item getItem() {
        return item;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }

    public boolean isEmpty() {
        return this == EMPTY || item == null || count <= 0;
    }

    public ItemStack copy() {
        if (isEmpty()) return EMPTY;
        ItemStack copy = new ItemStack(item, count);
        copy.tag = tag != null ? tag.copy() : null;
        return copy;
    }

    public static final ItemStack EMPTY = new ItemStack((Item) null);
}
