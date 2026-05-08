import type { SourcePackageId } from "minecraft-developing-mcp-shared-types";

import type { SourcePackageRecipe, SourcePackageRecipeRegistry } from "./contracts.js";

export function findSourcePackageRecipe(
  recipes: SourcePackageRecipeRegistry,
  packageId: SourcePackageId
): SourcePackageRecipe | undefined {
  return recipes[packageId];
}
