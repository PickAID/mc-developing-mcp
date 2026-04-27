import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation
} from "@mcpskill/shared-types";

import {
  readSourcePackageConfirmation,
  writeSourcePackageConfirmation
} from "./confirmation.js";

describe("source package confirmation", () => {
  it("writes and reads confirmation state for a package-version scope", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const confirmation: SourcePackageConfirmation = {
      packageId: "minecraft-1.20.1-source-pack-named",
      namespace: "minecraft",
      minecraftVersion: "1.20.1",
      artifactType: "source-pack",
      variant: "named",
      scope: "package-version",
      approvedAt: "2026-04-24T02:00:00Z",
      source: "explicit-user-confirmation"
    };

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

    await expect(
      readFile(
        join(
          runtimeLayout.locks,
          "source-packages",
          "minecraft-1.20.1-source-pack-named.confirmation.json"
        ),
        "utf-8"
      )
    ).resolves.toContain('"scope": "package-version"');

    await expect(
      readSourcePackageConfirmation(runtimeLayout, confirmation)
    ).resolves.toEqual(confirmation);
  });

  it("returns undefined when no confirmation exists", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);

    await expect(
      readSourcePackageConfirmation(runtimeLayout, {
        packageId: "minecraft-1.21.1-source-pack-named",
        namespace: "minecraft",
        minecraftVersion: "1.21.1",
        artifactType: "source-pack",
        variant: "named"
      })
    ).resolves.toBeUndefined();
  });
});

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}
