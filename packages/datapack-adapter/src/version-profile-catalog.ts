import type { DataKind } from "./types.js";
import {
  createPackFormatVersion,
  type DatapackPackFormatVersion
} from "./pack-format.js";

export interface KnownVersionProfile {
  minecraftVersion: string;
  packFormat: number;
  packFormatId: string;
  packFormatVersion: DatapackPackFormatVersion;
  knownDataKinds: DataKind[];
}

const DEFAULT_DATA_KINDS: DataKind[] = [
  "advancements",
  "damage_type",
  "functions",
  "item_modifiers",
  "loot_tables",
  "predicates",
  "recipes",
  "registry",
  "structures",
  "tags",
  "worldgen"
];

export const KNOWN_VERSION_PROFILES: KnownVersionProfile[] = [
  profile("1.18.2", 9),
  profile("1.19", 10),
  profile("1.19.1", 10),
  profile("1.19.2", 10),
  profile("1.19.3", 10),
  profile("1.19.4", 12),
  profile("1.20", 15),
  profile("1.20.1", 15),
  profile("1.20.2", 18),
  profile("1.20.3", 26),
  profile("1.20.4", 26),
  profile("1.20.5", 41),
  profile("1.20.6", 41),
  profile("1.21", 48),
  profile("1.21.1", 48),
  profile("1.21.2", 57),
  profile("1.21.3", 57),
  profile("1.21.4", 61),
  profile("1.21.5", 71),
  profile("1.21.6", 80),
  profile("1.21.7", 81),
  profile("1.21.8", 81),
  profile("1.21.9", 88, 0),
  profile("1.21.10", 88, 0),
  profile("1.21.11", 94, 1),
  profile("26.1", 101, 1),
  profile("26.1.1", 101, 1),
  profile("26.1.2", 101, 1)
];

function profile(
  minecraftVersion: string,
  major: number,
  minor?: number
): KnownVersionProfile {
  const packFormatVersion = createPackFormatVersion(major, minor, {
    explicitMinor: minor !== undefined
  });
  return {
    minecraftVersion,
    packFormat: Number(packFormatVersion.id),
    packFormatId: packFormatVersion.id,
    packFormatVersion,
    knownDataKinds: DEFAULT_DATA_KINDS
  };
}
