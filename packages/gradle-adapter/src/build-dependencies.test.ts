import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractGradleDeclaredDependencies,
  readGradleDeclaredDependencies
} from "./build-dependencies.js";

describe("extractGradleDeclaredDependencies", () => {
  it("extracts common Groovy and Kotlin dependency notations", () => {
    expect(
      extractGradleDeclaredDependencies(`
        dependencies {
          implementation "org.widgets:widget-api:1.0.0"
          modImplementation("com.example:example-lib:2.0.0")
          api(group = "net.minecraftforge", name = "eventbus", version = "6.2.33")
        }
      `)
    ).toEqual([
      {
        group: "org.widgets",
        artifact: "widget-api",
        version: "1.0.0",
        notation: "org.widgets:widget-api:1.0.0"
      },
      {
        group: "com.example",
        artifact: "example-lib",
        version: "2.0.0",
        notation: "com.example:example-lib:2.0.0"
      },
      {
        group: "net.minecraftforge",
        artifact: "eventbus",
        version: "6.2.33",
        notation: "net.minecraftforge:eventbus:6.2.33"
      }
    ]);
  });
});

describe("readGradleDeclaredDependencies", () => {
  it("reads dependency declarations from build.gradle and build.gradle.kts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-deps-"));

    await writeGradleFile(
      workspaceRoot,
      "build.gradle",
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await writeGradleFile(
      workspaceRoot,
      "build.gradle.kts",
      'dependencies { modImplementation("com.example:example-lib:2.0.0") }\n'
    );

    await expect(
      readGradleDeclaredDependencies({ workspaceRoot })
    ).resolves.toMatchObject([
      {
        group: "org.widgets",
        artifact: "widget-api",
        sourceFile: "build.gradle"
      },
      {
        group: "com.example",
        artifact: "example-lib",
        sourceFile: "build.gradle.kts"
      }
    ]);
  });

  it("resolves version catalog aliases used by Gradle build files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-deps-"));

    await writeGradleFile(
      workspaceRoot,
      "build.gradle.kts",
      "dependencies { implementation(libs.forge.eventbus) }\n"
    );
    await writeGradleFile(
      workspaceRoot,
      "gradle/libs.versions.toml",
      [
        "[versions]",
        "forgeEventbus = \"6.2.33\"",
        "",
        "[libraries]",
        "forge-eventbus = { module = \"net.minecraftforge:eventbus\", version.ref = \"forgeEventbus\" }"
      ].join("\n")
    );

    await expect(
      readGradleDeclaredDependencies({ workspaceRoot })
    ).resolves.toContainEqual({
      group: "net.minecraftforge",
      artifact: "eventbus",
      version: "6.2.33",
      notation: "net.minecraftforge:eventbus:6.2.33",
      sourceFile: "build.gradle.kts"
    });
  });

  it("resolves simple gradle.properties placeholders in dependency notations", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-deps-"));

    await writeGradleFile(
      workspaceRoot,
      "build.gradle",
      'dependencies { runtimeOnly "dev.xkmc:l2core:${l2core_ver}" }\n'
    );
    await writeGradleFile(workspaceRoot, "gradle.properties", "l2core_ver = 3.0.8+11\n");

    await expect(readGradleDeclaredDependencies({ workspaceRoot })).resolves.toEqual([
      {
        group: "dev.xkmc",
        artifact: "l2core",
        version: "3.0.8+11",
        notation: "dev.xkmc:l2core:3.0.8+11",
        sourceFile: "build.gradle"
      }
    ]);
  });

  it("reads dependency declarations from included Gradle subprojects", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-deps-"));

    await writeGradleFile(
      workspaceRoot,
      "settings.gradle",
      'include ":common", ":content:core"\n'
    );
    await writeGradleFile(
      workspaceRoot,
      "common/build.gradle",
      'dependencies { modImplementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await writeGradleFile(
      workspaceRoot,
      "content/core/build.gradle.kts",
      'dependencies { modApi("com.example:content-core:2.0.0") }\n'
    );

    await expect(
      readGradleDeclaredDependencies({ workspaceRoot })
    ).resolves.toMatchObject([
      {
        group: "org.widgets",
        artifact: "widget-api",
        sourceFile: "common/build.gradle"
      },
      {
        group: "com.example",
        artifact: "content-core",
        sourceFile: "content/core/build.gradle.kts"
      }
    ]);
  });

  it("honors static Gradle projectDir mappings for included subprojects", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-deps-"));

    await writeGradleFile(
      workspaceRoot,
      "settings.gradle",
      [
        'include ":api"',
        'project(":api").projectDir = file("modules/api")',
        ""
      ].join("\n")
    );
    await writeGradleFile(
      workspaceRoot,
      "modules/api/build.gradle",
      'dependencies { modImplementation "org.widgets:widget-api:1.0.0" }\n'
    );

    await expect(
      readGradleDeclaredDependencies({ workspaceRoot })
    ).resolves.toContainEqual({
      group: "org.widgets",
      artifact: "widget-api",
      version: "1.0.0",
      notation: "org.widgets:widget-api:1.0.0",
      sourceFile: "modules/api/build.gradle"
    });
  });
});

async function writeGradleFile(
  workspaceRoot: string,
  fileName: string,
  content: string
): Promise<void> {
  const targetPath = join(workspaceRoot, fileName);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
}
