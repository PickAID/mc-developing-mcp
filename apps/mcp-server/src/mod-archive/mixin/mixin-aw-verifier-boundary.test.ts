import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectAccessWidenerTargetEvidence } from "../access-widener/access-widener-evidence.js";
import { lookupMixinTargetVerification } from "../content/mod-archive-content-owners.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("Mixin/AW verifier boundary contracts", () => {
  it("labels Mixin mapping and injection-point verification as unavailable", async () => {
    const result = await lookupMixinTargetVerification({
      workspaceRoot: "/tmp/workspace",
      archivePaths: [],
      requestText: [
        "Mixin apply failed demo.mixins.json:CompatMixin -> com.example.compat.TargetApi:",
        "org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException",
        "@At(value=\"INVOKE\", target=\"Lcom/example/compat/TargetApi;call()V\")"
      ].join(" ")
    });

    expect(result?.payload).toMatchObject({
      source: "mod_archive_content",
      mode: "mixin_target_verification",
      namespaceTranslation: false,
      semanticVerification: false,
      mappingNamespaceTranslation: "unavailable",
      injectionPointSemanticVerification: false,
      injectionPointVerificationStatus: "unavailable",
      fullSemanticVerifier: false,
      descriptorProofLevel: "member_parameter_types_only",
      verifications: [
        {
          status: "source_unavailable",
          requestedTarget: "com.example.compat.TargetApi"
        }
      ]
    });
  });

  it("labels AW targets as parser-only applicability evidence", async () => {
    const root = await createTempRoot("mcpskill-aw-boundary-");
    const archivePath = join(root, "mods", "compat.jar");
    await writeBinary(
      archivePath,
      createZip([
        {
          name: "compat.accesswidener",
          content: [
            "accessWidener v2 named",
            "accessible class com/example/compat/TargetApi",
            "accessible method com/example/compat/TargetApi call ()V"
          ].join("\n")
        }
      ])
    );

    await expect(
      collectAccessWidenerTargetEvidence({ archivePaths: [archivePath] })
    ).resolves.toMatchObject({
      namespaceTranslation: false,
      namespaceTranslationStatus: "unavailable",
      mappingNamespaceTranslation: "unavailable",
      semanticVerification: false,
      applicabilityStatus: "unknown",
      applicabilityProofLevel: "parser_only",
      warnings: [
        "mappingNamespaceTranslation=unavailable: AW/ClassTweaker namespaces are reported from file headers only.",
        "applicabilityProofLevel=parser_only: AW/ClassTweaker targets are parser evidence, not verified target applicability."
      ],
      files: [
        {
          path: "compat.accesswidener",
          targets: [
            {
              kind: "class",
              owner: "com.example.compat.TargetApi",
              mappingNamespaceTranslation: "unavailable",
              applicabilityStatus: "unknown",
              applicabilityProofLevel: "parser_only"
            },
            {
              kind: "method",
              owner: "com.example.compat.TargetApi",
              name: "call",
              mappingNamespaceTranslation: "unavailable",
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
