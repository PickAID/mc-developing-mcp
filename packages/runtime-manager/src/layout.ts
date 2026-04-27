import { join, normalize } from "node:path";

import type { ManagedRuntimeLayout } from "@mcpskill/shared-types";

export function resolveManagedRuntimeLayout(
  runtimeRoot: string
): ManagedRuntimeLayout {
  const normalizedRoot = normalize(runtimeRoot);

  return {
    root: normalizedRoot,
    downloads: join(normalizedRoot, "downloads"),
    installs: join(normalizedRoot, "installs"),
    locks: join(normalizedRoot, "locks")
  };
}
