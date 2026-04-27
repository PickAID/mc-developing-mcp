import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { resolveGradleSourceArchiveLookup } from "./gradle-source-archive-lookup.js";

describe("resolveGradleSourceArchiveLookup", () => {
  it("prioritizes package-matching sources jars before unrelated jars", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const unrelatedJar = joinGradleSourceJar(
      gradleUserHome,
      "aaa.example",
      "unused-lib",
      "1.0.0"
    );
    const sourceJar = joinGradleSourceJar(
      gradleUserHome,
      "com.example",
      "example-lib",
      "1.0.0"
    );

    await writeZip(unrelatedJar, [
      {
        name: "aaa/example/Unused.java",
        content: "package aaa.example;\npublic class Unused {}\n",
        compressionMethod: 0
      }
    ]);
    await writeZip(sourceJar, [
      {
        name: "com/example/lib/Widget.java",
        content: "package com.example.lib;\npublic class Widget {}\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "Inspect com.example.lib.Widget before guessing.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      status: "ready",
      searchedArchives: 1,
      references: [
        {
          sourceArchive: sourceJar,
          relativePath: "com/example/lib/Widget.java",
          content: "package com.example.lib;\npublic class Widget {}\n"
        }
      ]
    });
  });

  it("maps nested crash classes to the outer Java source file", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const sourceJar = joinGradleSourceJar(
      gradleUserHome,
      "com.example",
      "example-lib",
      "1.0.0"
    );

    await writeZip(sourceJar, [
      {
        name: "com/example/lib/Widget.java",
        content: "package com.example.lib;\npublic class Widget { class Nested {} }\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "\tat com.example.lib.Widget$Nested.tick(Widget.java:42)",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      request: {
        symbol: "com.example.lib.Widget$Nested",
        relativePath: "com/example/lib/Widget.java"
      },
      references: [
        {
          sourceArchive: sourceJar,
          relativePath: "com/example/lib/Widget.java"
        }
      ]
    });
  });

  it("prioritizes sources jars for dependencies declared by the workspace", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const unrelatedJar = joinGradleSourceJar(
      gradleUserHome,
      "com.example",
      "wrong-lib",
      "1.0.0"
    );
    const declaredJar = joinGradleSourceJar(
      gradleUserHome,
      "org.widgets",
      "widget-api",
      "1.0.0"
    );

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await writeZip(unrelatedJar, [
      {
        name: "com/example/lib/NotWidget.java",
        content: "package com.example.lib;\npublic class NotWidget {}\n",
        compressionMethod: 0
      }
    ]);
    await writeZip(declaredJar, [
      {
        name: "com/example/lib/Widget.java",
        content: "package com.example.lib;\npublic class Widget {}\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "Inspect com.example.lib.Widget from project dependencies.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      searchedArchives: 1,
      references: [
        {
          sourceArchive: declaredJar,
          relativePath: "com/example/lib/Widget.java"
        }
      ]
    });
  });

  it("prioritizes sources jars declared through version catalog aliases", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const unrelatedJar = joinGradleSourceJar(
      gradleUserHome,
      "com.example",
      "wrong-lib",
      "1.0.0"
    );
    const declaredJar = joinGradleSourceJar(
      gradleUserHome,
      "org.widgets",
      "widget-api",
      "1.0.0"
    );

    await writeTextFile(
      join(workspaceRoot, "build.gradle.kts"),
      "dependencies { implementation(libs.widget.api) }\n"
    );
    await writeTextFile(
      join(workspaceRoot, "gradle", "libs.versions.toml"),
      [
        "[versions]",
        "widgetApi = \"1.0.0\"",
        "",
        "[libraries]",
        "widget-api = { module = \"org.widgets:widget-api\", version.ref = \"widgetApi\" }"
      ].join("\n")
    );
    await writeZip(unrelatedJar, [
      {
        name: "com/example/lib/NotWidget.java",
        content: "package com.example.lib;\npublic class NotWidget {}\n",
        compressionMethod: 0
      }
    ]);
    await writeZip(declaredJar, [
      {
        name: "com/example/lib/Widget.java",
        content: "package com.example.lib;\npublic class Widget {}\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "Inspect com.example.lib.Widget from catalog dependency.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      searchedArchives: 1,
      references: [
        {
          sourceArchive: declaredJar,
          relativePath: "com/example/lib/Widget.java"
        }
      ]
    });
  });

  it("uses declared dependency source archives before broad cache scanning", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const sourceJar = joinGradleSourceJar(
      gradleUserHome,
      "org.widgets",
      "widget-api",
      "1.0.0"
    );

    await writeTextFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await writeZip(sourceJar, [
      {
        name: "com/example/lib/Widget.java",
        content: "package com.example.lib;\npublic class Widget {}\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "Inspect com.example.lib.Widget from direct declared cache path.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false,
          maxResults: 0
        }
      })
    ).resolves.toMatchObject({
      searchedArchives: 1,
      references: [
        {
          sourceArchive: sourceJar,
          reason:
            "declared Gradle dependency org.widgets:widget-api:1.0.0 in build.gradle"
        }
      ]
    });
  });
});

async function createLookupWorkspace(): Promise<{
  gradleUserHome: string;
  workspaceRoot: string;
}> {
  return {
    gradleUserHome: await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-")),
    workspaceRoot: await mkdtemp(join(tmpdir(), "mcpskill-workspace-"))
  };
}

function joinGradleSourceJar(
  gradleUserHome: string,
  group: string,
  artifact: string,
  version: string
): string {
  return join(
    gradleUserHome,
    "caches",
    "modules-2",
    "files-2.1",
    group,
    artifact,
    version,
    "hash",
    `${artifact}-${version}-sources.jar`
  );
}

async function writeZip(path: string, entries: ZipFixtureEntry[]): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, createZip(entries));
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

interface ZipFixtureEntry {
  name: string;
  content: string;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const compressed =
      entry.compressionMethod === 8 ? deflateRawSync(content) : content;
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.compressionMethod, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, compressed);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
