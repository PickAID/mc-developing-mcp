import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverDeclaredDependencyBinaryArchives } from "./dependency-binary-archives.js";

describe("discoverDeclaredDependencyBinaryArchives", () => {
  it("locates binary jars directly from declared Gradle dependency coordinates", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-dep-bin-workspace-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-dep-bin-home-"));
    const binaryJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "org.widgets",
      "widget-api",
      "1.0.0",
      "hash",
      "widget-api-1.0.0.jar"
    );

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await mkdir(join(binaryJar, ".."), { recursive: true });
    await writeFile(binaryJar, Buffer.from("not a real jar"));

    await expect(
      discoverDeclaredDependencyBinaryArchives({
        workspaceRoot,
        gradleUserHome,
        includeDefaultGradleUserHome: false
      })
    ).resolves.toEqual([
      {
        archivePath: binaryJar,
        source: "gradle-cache",
        confidence: "high",
        reason:
          "declared Gradle dependency org.widgets:widget-api:1.0.0 in build.gradle"
      }
    ]);
  });

  it("locates runtime classifier jars and skips documentation classifiers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-dep-bin-workspace-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-dep-bin-home-"));
    const hashRoot = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "org.widgets",
      "widget-api",
      "1.0.0",
      "hash"
    );
    const allJar = join(hashRoot, "widget-api-1.0.0-all.jar");
    const devJar = join(hashRoot, "widget-api-1.0.0-dev.jar");

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await mkdir(hashRoot, { recursive: true });
    await writeFile(allJar, Buffer.from("all jar"));
    await writeFile(devJar, Buffer.from("dev jar"));
    await writeFile(join(hashRoot, "widget-api-1.0.0-sources.jar"), Buffer.from("sources"));
    await writeFile(join(hashRoot, "widget-api-1.0.0-javadoc.jar"), Buffer.from("docs"));

    await expect(
      discoverDeclaredDependencyBinaryArchives({
        workspaceRoot,
        gradleUserHome,
        includeDefaultGradleUserHome: false
      })
    ).resolves.toMatchObject([
      { archivePath: allJar },
      { archivePath: devJar }
    ]);
  });

  it("locates property-resolved libs jars with build metadata and runtime classifiers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-dep-bin-workspace-"));
    const libsRoot = join(workspaceRoot, "libs");
    const binaryJar = join(libsRoot, "l2core-3.0.8+11.jar");
    const slimJar = join(libsRoot, "l2library-3.0.4-slim.jar");

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      [
        "dependencies {",
        '  runtimeOnly "dev.xkmc:l2core:${l2core_ver}"',
        '  implementation "dev.xkmc:l2library:${l2library_ver}-slim"',
        "}",
        ""
      ].join("\n")
    );
    await writeFile(
      join(workspaceRoot, "gradle.properties"),
      ["l2core_ver = 3.0.8+11", "l2library_ver = 3.0.4", ""].join("\n")
    );
    await mkdir(libsRoot, { recursive: true });
    await writeFile(binaryJar, Buffer.from("binary jar"));
    await writeFile(slimJar, Buffer.from("slim jar"));
    await writeFile(join(libsRoot, "l2core-3.0.8+11-sources.jar"), Buffer.from("sources"));

    await expect(
      discoverDeclaredDependencyBinaryArchives({
        workspaceRoot,
        includeDefaultGradleUserHome: false
      })
    ).resolves.toEqual([
      {
        archivePath: binaryJar,
        source: "workspace",
        confidence: "high",
        reason:
          "declared Gradle dependency dev.xkmc:l2core:3.0.8+11 in build.gradle; workspace libs directory"
      },
      {
        archivePath: slimJar,
        source: "workspace",
        confidence: "high",
        reason:
          "declared Gradle dependency dev.xkmc:l2library:3.0.4-slim in build.gradle; workspace libs directory"
      }
    ]);
  });
});
