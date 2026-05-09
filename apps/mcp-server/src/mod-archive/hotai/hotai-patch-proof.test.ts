import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { executeMcpServerModArchiveContent } from "../content/mod-archive-content-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("HotAI patch proof", () => {
  it("summarizes badiff patch files and proves target class ownership", async () => {
    const workspaceRoot = await createHotaiWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Prepare Hotai badiff evidence for com.example.problem.CrashHandler in hotai/before_mixin."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      summary: "Verified 1 HotAI patch target(s) against local mod archives.",
      payload: {
        source: "mod_archive_content",
        mode: "hotai_patch_proof",
        tokenPolicy: "compact_hotai_patch_proof",
        executionPolicy: "read_only_no_patch_execution",
        patchFileCount: 1,
        targetClassCount: 1,
        phaseCounts: {
          before_mixin: 1
        },
        patches: [
          {
            relativePath: "hotai/before_mixin/com/example/problem/CrashHandler.badiff",
            phase: "before_mixin",
            targetClass: "com.example.problem.CrashHandler",
            targetOwner: {
              binaryName: "com.example.problem.CrashHandler",
              relativePath: "com/example/problem/CrashHandler.class",
              matchKind: "exact"
            },
            proofStatus: "owner_matched"
          }
        ],
        unmatchedTargets: [],
        searchedArchives: 1,
        truncated: false
      }
    });
  });
});

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mc-developing-mcp-hotai-proof",
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

async function createHotaiWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mc-developing-hotai-"));
  tempRoots.push(workspaceRoot);

  await writeBinary(
    join(workspaceRoot, "mods", "problem-mod.jar"),
    createZip([
      {
        name: "com/example/problem/CrashHandler.class",
        content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
        compressionMethod: 0
      }
    ])
  );
  await writeBinary(
    join(workspaceRoot, "hotai", "before_mixin", "com", "example", "problem", "CrashHandler.badiff"),
    Buffer.from("badiff fixture")
  );

  return workspaceRoot;
}

async function writeBinary(path: string, content: Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

interface ZipFixtureEntry {
  name: string;
  content: Buffer;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed =
      entry.compressionMethod === 8 ? deflateRawSync(entry.content) : entry.content;
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.compressionMethod, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
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
