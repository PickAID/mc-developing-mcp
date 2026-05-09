import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { executeMcpServerModArchiveContent } from "./mod-archive-content-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mod archive crash class owner priority", () => {
  it("prioritizes crash class owners over crash resource ids", async () => {
    const workspaceRoot = await createWorkspace([
      ["content-mod.jar", [
        "data/demo/recipes/gear.json",
        "com/example/problem/CrashHandler.class"
      ]]
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Crash log class references: com.example.problem.CrashHandler",
        "Crash log resource references: demo:gear"
      ].join("\n")
    );

    const result = await executeMcpServerModArchiveContent(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "class_owner",
        requestedClasses: ["com.example.problem.CrashHandler"],
        matches: [
          {
            sourceArchive: expect.stringContaining("mods/content-mod.jar"),
            binaryName: "com.example.problem.CrashHandler",
            relativePath: "com/example/problem/CrashHandler.class",
            matchKind: "exact"
          }
        ]
      }
    });
    expect(result.payload).not.toHaveProperty("queries");
    expect(result.payload).not.toHaveProperty("domains");
  });

  it("scans beyond the generic content search cap for crash class owners", async () => {
    const archives = Array.from({ length: 70 }, (_, index) => [
      `content-${String(index).padStart(2, "0")}.jar`,
      [
        index === 69
          ? "com/example/problem/CrashHandler.class"
          : `com/example/filler/Unused${index}.class`
      ]
    ] as const);
    const workspaceRoot = await createWorkspace(archives);
    const input = await createExecutorInput(
      workspaceRoot,
      "Crash log class references: com.example.problem.CrashHandler"
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "class_owner",
        searchedArchives: 70,
        matches: [
          {
            sourceArchive: expect.stringContaining("mods/content-69.jar"),
            binaryName: "com.example.problem.CrashHandler"
          }
        ]
      }
    });
  });

  it("locates crash-mentioned mod ids through local archive metadata", async () => {
    const workspaceRoot = await createWorkspace([
      ["acceleratedrendering.jar", [
        {
          name: "META-INF/mods.toml",
          content: [
            'modId="acceleratedrendering"',
            'displayName="Accelerated Rendering"',
            'version="1.0.8"'
          ].join("\n")
        }
      ]]
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      "Crash log loader mod ids: acceleratedrendering"
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "loader_mod_owner",
        modId: "acceleratedrendering",
        missingModIds: [],
        owner: {
          archivePath: expect.stringContaining("mods/acceleratedrendering.jar"),
          archiveRelativePath: "mods/acceleratedrendering.jar",
          loader: "forge",
          modId: "acceleratedrendering",
          name: "Accelerated Rendering",
          version: "1.0.8"
        }
      }
    });
  });

  it("keeps crash-mentioned missing mod ids visible when later ids have owners", async () => {
    const workspaceRoot = await createWorkspace([
      ["oculus.jar", [
        {
          name: "META-INF/mods.toml",
          content: ['modId="oculus"', 'displayName="Oculus"'].join("\n")
        }
      ]]
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      "Crash log loader mod ids: acceleratedrendering, oculus"
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "loader_mod_owner",
        requestedModIds: ["acceleratedrendering", "oculus"],
        missingModIds: ["acceleratedrendering"],
        owners: [
          {
            archivePath: expect.stringContaining("mods/oculus.jar"),
            modId: "oculus"
          }
        ]
      }
    });
  });
});

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "mod_archive_content"
  );

  if (!candidate) {
    throw new Error("Expected mod_archive_content candidate.");
  }

  return { candidate, evidencePlan, requestPlan };
}

async function createWorkspace(
  archives: ReadonlyArray<readonly [string, readonly ZipFixtureInput[]]>
): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-priority-mcp-"));
  tempRoots.push(workspaceRoot);

  for (const [fileName, entries] of archives) {
    await mkdir(join(workspaceRoot, "mods"), { recursive: true });
    await writeFile(join(workspaceRoot, "mods", fileName), createZip(entries));
  }

  return workspaceRoot;
}

type ZipFixtureInput = string | { name: string; content: string | Buffer };

function createZip(entries: readonly ZipFixtureInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const entryName = typeof entry === "string" ? entry : entry.name;
    const name = Buffer.from(entryName);
    const content = typeof entry === "string"
      ? Buffer.from([0xca, 0xfe, 0xba, 0xbe])
      : Buffer.isBuffer(entry.content)
        ? entry.content
        : Buffer.from(entry.content);
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
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
