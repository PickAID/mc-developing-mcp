import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverDeclaredDependencySourceArchives } from "./dependency-source-archives.js";

describe("discoverDeclaredDependencySourceArchives", () => {
  it("locates sources jars directly from declared Gradle dependency coordinates", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-dep-src-workspace-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-dep-src-home-"));
    const sourceJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "org.widgets",
      "widget-api",
      "1.0.0",
      "hash",
      "widget-api-1.0.0-sources.jar"
    );

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await mkdir(join(sourceJar, ".."), { recursive: true });
    await writeFile(sourceJar, Buffer.from("not a real jar"));

    await expect(
      discoverDeclaredDependencySourceArchives({
        workspaceRoot,
        gradleUserHome,
        includeDefaultGradleUserHome: false
      })
    ).resolves.toEqual([
      {
        archivePath: sourceJar,
        source: "gradle-cache",
        confidence: "high",
        reason:
          "declared Gradle dependency org.widgets:widget-api:1.0.0 in build.gradle"
      }
    ]);
  });
});
