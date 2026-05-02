import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createFileMavenMetadataCache,
  resolveExternalModMetadataCacheLayout
} from "./metadata-cache.js";

describe("external mod metadata cache", () => {
  it("writes and reads Maven metadata under the runtime root", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-extmod-cache-"));
    const layout = resolveExternalModMetadataCacheLayout(runtimeRoot);
    const cache = createFileMavenMetadataCache(runtimeRoot);
    const url = new URL(
      "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
    );

    await cache.write(url, "<metadata><versioning /></metadata>");

    await expect(cache.read(url)).resolves.toMatchObject({
      sourceUrl: url.toString(),
      value: "<metadata><versioning /></metadata>"
    });
    await expect(
      readFile(
        join(
          layout.mavenMetadataDir,
          "https%3A%2F%2Fmaven.example%2Freleases%2Fcom%2Fexample%2Fdemo-mod%2Fmaven-metadata.xml.json"
        ),
        "utf-8"
      )
    ).resolves.toContain('"kind": "maven-metadata"');
  });
});
