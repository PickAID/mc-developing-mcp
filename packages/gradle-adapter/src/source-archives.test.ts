import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  discoverGradleSourceArchives,
  discoverMinecraftSourceArchives
} from "./source-archives.js";

describe("discoverGradleSourceArchives", () => {
  it("discovers sources jars from workspace and configured Gradle cache roots", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-workspace-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const workspaceJar = join(workspaceRoot, "libs", "addon-1.0.0-sources.jar");
    const minecraftJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "net.minecraft",
      "client",
      "1.20.1",
      "hash",
      "client-1.20.1-sources.jar"
    );

    await mkdir(join(workspaceRoot, "libs"), { recursive: true });
    await mkdir(join(minecraftJar, ".."), { recursive: true });
    await writeFile(workspaceJar, "");
    await writeFile(minecraftJar, "");
    await writeFile(join(workspaceRoot, "libs", "addon-1.0.0.jar"), "");

    await expect(
      discoverGradleSourceArchives({
        workspaceRoot,
        gradleUserHome,
        includeDefaultGradleUserHome: false
      })
    ).resolves.toMatchObject([
      {
        archivePath: minecraftJar,
        source: "gradle-cache"
      },
      {
        archivePath: workspaceJar,
        source: "workspace"
      }
    ]);
  });

  it("filters Minecraft source archives by detected runtime version", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-workspace-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const minecraftJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "net.minecraft",
      "client",
      "1.20.1",
      "hash",
      "client-1.20.1-sources.jar"
    );
    const otherJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "dev.example",
      "addon",
      "1.0.0",
      "hash",
      "addon-1.0.0-sources.jar"
    );

    await mkdir(join(minecraftJar, ".."), { recursive: true });
    await mkdir(join(otherJar, ".."), { recursive: true });
    await writeFile(minecraftJar, "");
    await writeFile(otherJar, "");

    await expect(
      discoverMinecraftSourceArchives({
        workspaceRoot,
        gradleUserHome,
        includeDefaultGradleUserHome: false,
        minecraftVersion: "1.20.1"
      })
    ).resolves.toMatchObject([
      {
        archivePath: minecraftJar,
        confidence: "high"
      }
    ]);
  });
});
