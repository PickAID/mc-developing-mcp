import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceIndex } from "@mcpskill/source-index";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { lookupMixinTargetVerification } from "../content/mod-archive-content-owners.js";
import { executeMcpServerRequest } from "../../request/execution/request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("Mixin target evidence routing", () => {
  it("does not route vanilla member targets through mod archive verification", async () => {
    await expect(
      lookupMixinTargetVerification({
        workspaceRoot: "/tmp/workspace",
        archivePaths: [],
        requestText: "target=Lnet/minecraft/world/item/ItemStack;isEmpty()Z"
      })
    ).resolves.toBeUndefined();
  });

  it("verifies missing Mixin targets against mod archive class entries", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createMixinTargetWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The game crashes during Mixin apply; inspect latest.log and mods."
    });

    expect(result.executions).toMatchObject([
      {
        routeStep: "log_files",
        status: "context",
        payload: {
          source: "workspace_analyze",
          signals: {
            mixinTargetClassReferences: ["com.example.compat.TargetApi"]
          }
        }
      },
      {
        routeStep: "mod_archive_content",
        status: "selected",
        payload: {
          source: "mod_archive_content",
          mode: "mixin_target_verification",
          tokenPolicy: "compact_mixin_target_verification",
          namespaceTranslation: false,
          semanticVerification: false,
          descriptorProofLevel: "member_parameter_types_only",
          requestedTargets: ["com.example.compat.TargetApi"],
          verifications: [
            {
              status: "missing_target",
              requestedTarget: "com.example.compat.TargetApi",
              candidates: ["com.example.compat.TargetApiImpl"],
              nextReads: []
            }
          ]
        }
      }
    ]);
  });

  it("verifies exact Mixin targets before generic class-owner routing", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createMixinTargetWorkspace({
      classes: ["com/example/compat/TargetApi.class"],
      target: "com.example.compat.TargetApi"
    });
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The game crashes during Mixin apply; inspect latest.log and mods."
    });

    expect(result.selectedEvidence?.payload).toMatchObject({
      source: "mod_archive_content",
      mode: "mixin_target_verification",
      namespaceTranslation: false,
      semanticVerification: false,
      descriptorProofLevel: "member_parameter_types_only",
      verifications: [
        {
          status: "valid",
          requestedTarget: "com.example.compat.TargetApi",
          candidates: ["com.example.compat.TargetApi"]
        }
      ]
    });
  });

  it("adds source-index method proof for Mixin member targets", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createMixinTargetWorkspace({
      classes: ["com/example/compat/TargetApi.class"],
      target: "com.example.compat.TargetApi"
    });
    await createRuntimeSourceIndex(runtimeRoot);
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: [
        "The game crashes during Mixin apply; inspect latest.log and mods.",
        "target=Lcom/example/compat/TargetApi;call()V"
      ].join(" ")
    });

    expect(result.selectedEvidence?.payload).toMatchObject({
      source: "mod_archive_content",
      mode: "mixin_target_verification",
      requestedMembers: [
        {
          owner: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method"
        }
      ],
      verifications: [
        {
          status: "valid",
          requestedTarget: "com.example.compat.TargetApi",
          memberProofs: [
            {
              status: "valid",
              requestedMember: "call",
              memberKind: "method",
              descriptorProofLevel: "parameter_types",
              matches: [
                {
                  path: "com/example/compat/TargetApi.java",
                  signature: "call()"
                }
              ],
              nextReads: ["source.read com/example/compat/TargetApi.java:3-3"]
            }
          ]
        }
      ],
      searchedSourceIndexes: 1
    });
  });

  it("includes bounded access widener target evidence in Mixin verification", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createMixinTargetWorkspace({
      classes: ["com/example/compat/TargetApi.class"],
      target: "com.example.compat.TargetApi",
      metadata: [
        {
          name: "compat.accesswidener",
          content: [
            "accessWidener v2 named",
            "accessible class com/example/compat/TargetApi",
            "accessible method com/example/compat/TargetApi call ()V",
            "accessible class net/minecraft/world/World"
          ].join("\n")
        },
        {
          name: "compat.classtweaker",
          content: [
            "accessWidener v2 named",
            "extendable class com/example/compat/TweakerApi"
          ].join("\n")
        }
      ]
    });
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The game crashes during Mixin apply; inspect latest.log and mods."
    });

    expect(result.selectedEvidence?.payload).toMatchObject({
      source: "mod_archive_content",
      mode: "mixin_target_verification",
      namespaceTranslation: false,
      semanticVerification: false,
      descriptorProofLevel: "member_parameter_types_only",
      awTargetEvidence: {
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
        targetCount: 3,
        files: [
          {
            path: "compat.accesswidener",
            fileKind: "accesswidener",
            header: {
              namespace: "named",
              version: "v2"
            },
            targets: [
              {
                kind: "class",
                owner: "com.example.compat.TargetApi",
                access: "accessible"
              },
              {
                kind: "method",
                owner: "com.example.compat.TargetApi",
                name: "call",
                descriptor: "()V"
              }
            ],
            ignoredTargetCount: 1
          },
          {
            path: "compat.classtweaker",
            fileKind: "classtweaker",
            targets: [
              {
                kind: "class",
                owner: "com.example.compat.TweakerApi",
                access: "extendable"
              }
            ]
          }
        ],
        truncated: false
      }
    });
  });
});

async function createMixinTargetWorkspace(input: {
  classes?: string[];
  target?: string;
  metadata?: Array<{ name: string; content: string }>;
} = {}): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mixin-target-");
  const target = input.target ?? "com.example.compat.TargetApi";
  const classes = input.classes ?? ["com/example/compat/TargetApiImpl.class"];

  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      `Mixin apply failed demo.mixins.json:CompatMixin -> ${target}: org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException`,
      ""
    ].join("\n")
  );
  await writeBinary(
    join(workspaceRoot, "mods", "compat-mod.jar"),
    createZip([
      ...classes.map((name) => ({ name, content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]) })),
      ...(input.metadata ?? [])
    ])
  );

  return workspaceRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function createRuntimeSourceIndex(runtimeRoot: string): Promise<void> {
  const sourceRoot = join(runtimeRoot, "installs", "demo-source-pack");
  const javaPath = join(sourceRoot, "com", "example", "compat", "TargetApi.java");

  await writeText(
    javaPath,
    [
      "package com.example.compat;",
      "public class TargetApi {",
      "  public void call() {}",
      "}"
    ].join("\n")
  );
  await buildSourceIndex({
    sourceRoot,
    databasePath: join(sourceRoot, "source-index.sqlite"),
    packageId: "demo-source-pack"
  });
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
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
