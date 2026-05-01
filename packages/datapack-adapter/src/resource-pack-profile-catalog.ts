import {
  createPackFormatVersion,
  type DatapackPackFormatVersion
} from "./pack-format.js";
import type { AssetKind } from "./types.js";

export interface KnownResourcePackProfile {
  minecraftVersion: string;
  packFormat: number;
  packFormatId: string;
  packFormatVersion: DatapackPackFormatVersion;
  knownAssetKinds: AssetKind[];
}

const DEFAULT_ASSET_KINDS: AssetKind[] = [
  "atlases",
  "blockstates",
  "equipment",
  "font",
  "items",
  "lang",
  "models",
  "pack_metadata",
  "particles",
  "post_effect",
  "shaders",
  "sounds",
  "texts",
  "textures",
  "waypoint_style"
];

export const KNOWN_RESOURCE_PACK_PROFILES: KnownResourcePackProfile[] = [
  profile("1.18.2", 8),
  profile("1.19", 9),
  profile("1.19.1", 9),
  profile("1.19.2", 9),
  profile("1.19.3", 12),
  profile("1.19.4", 13),
  profile("1.20", 15),
  profile("1.20.1", 15),
  profile("1.20.2", 18),
  profile("1.20.3", 22),
  profile("1.20.4", 22),
  profile("1.20.5", 32),
  profile("1.20.6", 32),
  profile("1.21", 34),
  profile("1.21.1", 34),
  profile("1.21.2", 42),
  profile("1.21.3", 42),
  profile("1.21.4", 46),
  profile("1.21.5", 55),
  profile("1.21.6", 63),
  profile("1.21.7", 64),
  profile("1.21.8", 64),
  profile("1.21.9", 69, 0),
  profile("1.21.10", 69, 0),
  profile("1.21.11", 75, 0),
  profile("26.1", 84, 0),
  profile("26.1.1", 84, 0),
  profile("26.1.2", 84, 0)
];

function profile(
  minecraftVersion: string,
  major: number,
  minor?: number
): KnownResourcePackProfile {
  const packFormatVersion = createPackFormatVersion(major, minor, {
    explicitMinor: minor !== undefined
  });
  return {
    minecraftVersion,
    packFormat: Number(packFormatVersion.id),
    packFormatId: packFormatVersion.id,
    packFormatVersion,
    knownAssetKinds: DEFAULT_ASSET_KINDS
  };
}
