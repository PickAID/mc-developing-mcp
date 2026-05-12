import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLookupWorkspace,
  joinGradleSourceJar,
  longWidgetSource,
  writeTextFile,
  writeZip
} from "./gradle-source-archive-lookup.test-support.js";
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
          content: "package com.example.lib;\npublic class Widget {}\n",
          startLine: 1,
          endLine: 2,
          totalLines: 2,
          truncated: false
        }
      ]
    });
  });

  it("reports full-content line metadata without counting a trailing newline as an extra line", async () => {
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
        content: "line 1\nline 2\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "Inspect com.example.lib.Widget line metadata.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      references: [
        {
          content: "line 1\nline 2\n",
          startLine: 1,
          endLine: 2,
          totalLines: 2,
          truncated: false
        }
      ]
    });
  });

  it("bounds source archive content around stack trace line hints", async () => {
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
        content: longWidgetSource(),
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "\tat com.example.lib.Widget.tick(Widget.java:30)",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      request: {
        line: 30
      },
      references: [
        {
          content: expect.stringContaining("  // line 30"),
          startLine: 10,
          endLine: 50,
          totalLines: 62,
          truncated: true
        }
      ]
    });
  });

  it("reads explicit source archive follow-up ranges", async () => {
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
        content: longWidgetSource(),
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "source.read com/example/lib/Widget.java:20-25",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      request: {
        line: 20,
        endLine: 25
      },
      references: [
        {
          content: [
            "  // line 20",
            "  // line 21",
            "  // line 22",
            "  // line 23",
            "  // line 24",
            "  // line 25"
          ].join("\n"),
          startLine: 20,
          endLine: 25,
          totalLines: 62,
          truncated: true,
          nextReads: ["source.read com/example/lib/Widget.java:20-25"]
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

  it("falls back to broad Gradle cache when declared source archives miss the requested class", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const declaredJar = joinGradleSourceJar(
      gradleUserHome,
      "org.widgets",
      "widget-api",
      "1.0.0"
    );
    const fallbackJar = joinGradleSourceJar(
      gradleUserHome,
      "com.example",
      "fallback-lib",
      "1.0.0"
    );

    await writeTextFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "org.widgets:widget-api:1.0.0" }\n'
    );
    await writeZip(declaredJar, [
      {
        name: "org/widgets/Other.java",
        content: "package org.widgets;\npublic class Other {}\n",
        compressionMethod: 8
      }
    ]);
    await writeZip(fallbackJar, [
      {
        name: "com/example/lib/Widget.java",
        content: "package com.example.lib;\npublic class Widget {}\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText:
          "Inspect com.example.lib.Widget when declared source jar is incomplete.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      status: "ready",
      searchedArchives: 2,
      references: [
        {
          sourceArchive: fallbackJar,
          relativePath: "com/example/lib/Widget.java"
        }
      ],
      skipped: [
        {
          sourceArchive: declaredJar,
          relativePath: "com/example/lib/Widget.java",
          reason: "not-found"
        }
      ]
    });
  });

  it("reads a simple class name from a Gradle cache sources jar", async () => {
    const { gradleUserHome, workspaceRoot } = await createLookupWorkspace();
    const unrelatedJar = joinGradleSourceJar(
      gradleUserHome,
      "aaa.example",
      "unused-lib",
      "1.0.0"
    );
    const sourceJar = joinGradleSourceJar(
      gradleUserHome,
      "net.minecraftforge",
      "fmlloader",
      "1.20.1-47.4.10"
    );

    await writeZip(unrelatedJar, [
      {
        name: "aaa/example/FMLLoader.java",
        content: "package aaa.example;\npublic class FMLLoader {}\n",
        compressionMethod: 0
      }
    ]);
    await writeZip(sourceJar, [
      {
        name: "net/minecraftforge/fml/loading/FMLLoader.java",
        content:
          "package net.minecraftforge.fml.loading;\npublic class FMLLoader {}\n",
        compressionMethod: 8
      }
    ]);

    await expect(
      resolveGradleSourceArchiveLookup({
        workspaceRoot,
        requestText: "Read FMLLoader source from Gradle cache for Forge 1.20.1.",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      status: "ready",
      request: {
        symbol: "FMLLoader",
        relativePath: "FMLLoader.java",
        simpleName: "FMLLoader",
        versionHints: ["1.20.1"]
      },
      references: [
        {
          sourceArchive: sourceJar,
          relativePath: "net/minecraftforge/fml/loading/FMLLoader.java",
          content: expect.stringContaining("package net.minecraftforge.fml.loading")
        }
      ]
    });
  });
});
