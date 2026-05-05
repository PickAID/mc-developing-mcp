import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectAccessWidenerTargetEvidence } from "./access-widener-evidence.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("collectAccessWidenerTargetEvidence target presence proof", () => {
  it("raises AW member targets to target_presence from source-index evidence", async () => {
    const root = await createTempRoot("mcpskill-aw-target-presence-");
    const archivePath = join(root, "mods", "compat.jar");
    await writeBinary(
      archivePath,
      createZip([
        {
          name: "compat.accesswidener",
          content: [
            "accessWidener v2 named",
            "accessible method com/example/compat/TargetApi call ()V",
            "mutable field com/example/compat/TargetApi enabled Z",
            "accessible method com/example/compat/TargetApi missing ()V"
          ].join("\n")
        }
      ])
    );

    await expect(
      collectAccessWidenerTargetEvidence({
        archivePaths: [archivePath],
        targetEvidence: {
          availableMembers: [
            {
              ownerQualifiedName: "com.example.compat.TargetApi",
              memberName: "call",
              memberKind: "method",
              path: "com/example/compat/TargetApi.java",
              startLine: 3,
              endLine: 3,
              signature: "call()"
            },
            {
              ownerQualifiedName: "com.example.compat.TargetApi",
              memberName: "enabled",
              memberKind: "field",
              path: "com/example/compat/TargetApi.java",
              startLine: 2,
              endLine: 2,
              signature: "boolean enabled"
            }
          ]
        }
      })
    ).resolves.toMatchObject({
      applicabilityStatus: "partial",
      applicabilityProofLevel: "target_presence",
      semanticVerification: false,
      warnings: [
        "mappingNamespaceTranslation=unavailable: AW/ClassTweaker namespaces are reported from file headers only.",
        "applicabilityProofLevel=target_presence: matched targets prove only owner/member presence, not access-transformer semantics."
      ],
      files: [
        {
          targets: [
            {
              kind: "method",
              owner: "com.example.compat.TargetApi",
              name: "call",
              applicabilityStatus: "present",
              applicabilityProofLevel: "target_presence",
              targetPresenceProof: {
                evidenceKind: "source_index_member",
                owner: "com.example.compat.TargetApi",
                member: "call",
                path: "com/example/compat/TargetApi.java",
                signature: "call()"
              }
            },
            {
              kind: "field",
              owner: "com.example.compat.TargetApi",
              name: "enabled",
              applicabilityStatus: "present",
              applicabilityProofLevel: "target_presence"
            },
            {
              kind: "method",
              owner: "com.example.compat.TargetApi",
              name: "missing",
              applicabilityStatus: "unknown",
              applicabilityProofLevel: "parser_only"
            }
          ]
        }
      ]
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeBinary(path: string, content: Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function createZip(entries: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.isBuffer(entry.content)
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

    const localPart = Buffer.concat([localHeader, name, content]);
    localParts.push(localPart);
    centralParts.push(Buffer.concat([centralHeader, name]));
    localOffset += localPart.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}
