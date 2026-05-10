import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpToolHandler } from "./mcp-tools.js";

export function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

export async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-workspace-"));

  await mkdir(join(root, "kubejs", "server_scripts"), { recursive: true });
  await writeFile(join(root, "kubejs", "server_scripts", "main.js"), "\n");

  return root;
}

export async function createMdmSourcesRoot(
  release: MdmTestRelease = {
    artifactName: "core-docs-required-0.1.0.mdm-resource.json",
    sha256: "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
    sizeBytes: 1201
  }
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sources-"));

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      {
        id: "core-docs-required",
        manifestPath: "registry/packages/core-docs-required.json",
        required: true,
        format: "json"
      }
    ]
  });
  await writeJson(join(root, "registry", "packages", "core-docs-required.json"), {
    schemaVersion: 1,
    id: "core-docs-required",
    sourcePath: "packages/core/docs/required/package.json",
    currentRelease: {
      artifactName: release.artifactName,
      sha256: release.sha256,
      sizeBytes: release.sizeBytes
    }
  });

  return root;
}

export async function createMdmReleaseOut(
  body: string
): Promise<MdmTestReleaseOut> {
  return createMdmReleaseOutForPackage({
    body,
    artifactName: "core-docs-required-0.1.0.mdm-resource.json",
    packageId: "core-docs-required",
    namespace: "core",
    version: "0.1.0",
    releaseFamily: "core-docs",
    required: true
  });
}

export async function createMdmReleaseOutForPackage(input: {
  body: string;
  artifactName: string;
  packageId: string;
  namespace: string;
  version: string;
  releaseFamily: string;
  required?: boolean;
}): Promise<MdmTestReleaseOut> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-release-out-"));
  const manifestPath = join(root, "mdm-release-manifest.json");
  const sha256 = hashText(input.body);

  await writeFile(join(root, input.artifactName), input.body);
  await writeJson(manifestPath, {
    schemaVersion: 1,
    generatedAt: "2026-05-07T00:00:00.000Z",
    packages: [
      {
        packageId: input.packageId,
        version: input.version,
        namespace: input.namespace,
        artifactType: "docs",
        variant: input.required ? "required" : "docs",
        required: input.required ?? false,
        format: "json",
        artifactName: input.artifactName,
        sha256,
        sizeBytes: Buffer.byteLength(input.body),
        releaseChannel: "docs",
        releaseFamily: input.releaseFamily,
        capabilities: ["docs_search", "docs_direct_read", "resourcepack_trace"]
      }
    ]
  });

  return {
    manifestPath,
    artifactName: input.artifactName,
    body: input.body,
    sha256,
    sizeBytes: Buffer.byteLength(input.body)
  };
}

export async function createSinglePackageMdmSourcesRoot(input: {
  packageId: string;
  manifestName: string;
  release: MdmTestRelease;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sources-"));

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      {
        id: input.packageId,
        manifestPath: `registry/packages/${input.manifestName}`,
        required: false,
        format: "json"
      }
    ]
  });
  await writeJson(join(root, "registry", "packages", input.manifestName), {
    schemaVersion: 1,
    id: input.packageId,
    sourcePath: "packages/docs/client-visual/1.20.1/package.json",
    currentRelease: {
      artifactName: input.release.artifactName,
      sha256: input.release.sha256,
      sizeBytes: input.release.sizeBytes
    }
  });

  return root;
}

export function mdmDocsArtifactBody(): string {
  return JSON.stringify({
    schemaVersion: 1,
    package: {
      id: "core-docs-required",
      artifactType: "docs"
    },
    payload: {
      "core-docs.json": {
        repoPath: "packages/core/docs/required/payload/core-docs.json",
        content: JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              id: "offline-resource-status",
              title: "Offline Resource Status",
              summary:
                "Missing optional packages are degraded capability, not fatal failure.",
              searchTerms: [
                "offline resource status",
                "resource package",
                "degraded capability"
              ]
            }
          ]
        })
      }
    }
  });
}

export function mdmGuidanceArtifactBody(): string {
  return JSON.stringify({
    schemaVersion: 1,
    package: {
      identity: {
        packageId: "client-visual-1.20.1-guidance",
        displayName: "Client Visual 1.20.1 Guidance",
        namespace: "client-visual"
      },
      artifact: {
        kind: "docs_bundle",
        format: "json"
      },
      capabilities: ["docs_search", "docs_direct_read", "resourcepack_trace"]
    },
    payload: {
      "payload/client-visual-guidance.json": {
        repoPath:
          "packages/docs/client-visual/1.20.1/payload/client-visual-guidance.json",
        content: JSON.stringify({
          schemaVersion: 1,
          minecraftVersion: "1.20.1",
          purpose:
            "Translate low-knowledge visual requests into concrete Minecraft implementation evidence chains.",
          implementationChains: [
            {
              id: "block-entity-visual",
              chain: ["client renderer binding", "renderer implementation"]
            }
          ]
        })
      }
    }
  });
}

export function mdmVanillaSchemaDocsArtifactBody(): string {
  return JSON.stringify({
    schemaVersion: 1,
    package: {
      identity: {
        packageId: "vanilla-schema-docs",
        displayName: "Vanilla Schema Docs",
        namespace: "minecraft"
      },
      artifact: {
        kind: "docs_bundle",
        format: "json"
      },
      capabilities: [
        "docs_search",
        "docs_direct_read",
        "schema_reference",
        "mcdoc_reference",
        "datapack_trace",
        "resourcepack_trace"
      ]
    },
    payload: {
      "payload/explanations.json": {
        repoPath:
          "packages/docs/vanilla-schema-docs/payload/explanations.json",
        content: JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              id: "vanilla-schema-docs-datapack-mcdoc-java-data-recipe",
              kind: "format-reference",
              title: "vanilla-mcdoc recipe",
              summary:
                "Schema source for recipe datapack data. Use this before inventing JSON fields.",
              headings: ["datapack", "recipe", "mcdoc"],
              searchTerms: [
                "vanilla-mcdoc",
                "mcdoc",
                "datapack schema",
                "recipe",
                "java/data/recipe.mcdoc"
              ],
              codeSymbols: ["Recipe"],
              schemaDefinitionOutlines: [
                {
                  kind: "dispatch",
                  name: "minecraft:resource[recipe]",
                  line: 1,
                  target: "minecraft:resource[recipe]",
                  fields: [
                    {
                      kind: "field",
                      name: "type",
                      optional: false,
                      type: "string",
                      line: 2
                    }
                  ]
                }
              ],
              schemaSymbol: {
                source: "vanilla-mcdoc-generated-symbols",
                ref: "fixture-symbols-ref",
                modulePath: "::java::data::recipe",
                typePaths: ["::java::data::recipe::Recipe"],
                dispatchers: [
                  {
                    name: "minecraft:resource",
                    key: "recipe",
                    type: {
                      kind: "reference",
                      path: "::java::data::recipe::Recipe"
                    },
                    domain: "datapack"
                  }
                ]
              },
              upstreamPath: "java/data/recipe.mcdoc",
              contentHash: "fixture-recipe-hash"
            },
            {
              id: "vanilla-schema-docs-resource-pack-mcdoc-java-assets-model",
              kind: "format-reference",
              title: "vanilla-mcdoc model",
              summary:
                "Schema source for model resource-pack data. Use this before inventing JSON fields.",
              headings: ["resource-pack", "model", "mcdoc"],
              searchTerms: [
                "vanilla-mcdoc",
                "mcdoc",
                "resource-pack schema",
                "model",
                "java/assets/model.mcdoc"
              ],
              codeSymbols: ["Model"],
              schemaDefinitionOutlines: [
                {
                  kind: "dispatch",
                  name: "minecraft:resource[model]",
                  line: 1,
                  target: "minecraft:resource[model]",
                  fields: [
                    {
                      kind: "field",
                      name: "parent",
                      optional: true,
                      type: "string",
                      line: 2
                    }
                  ]
                }
              ],
              schemaSymbol: {
                source: "vanilla-mcdoc-generated-symbols",
                ref: "fixture-symbols-ref",
                modulePath: "::java::assets::model",
                typePaths: ["::java::assets::model::Model"],
                dispatchers: [
                  {
                    name: "minecraft:resource",
                    key: "model",
                    type: {
                      kind: "reference",
                      path: "::java::assets::model::Model"
                    },
                    domain: "resource-pack"
                  }
                ]
              },
              upstreamPath: "java/assets/model.mcdoc",
              contentHash: "fixture-model-hash"
            }
          ]
        })
      }
    }
  });
}

export function mdmResourcepackGuidanceArtifactBody(): string {
  return JSON.stringify({
    schemaVersion: 1,
    package: {
      identity: {
        packageId: "resourcepack-1.20.1-guidance",
        displayName: "Resource Pack 1.20.1 Guidance",
        namespace: "resourcepack"
      },
      artifact: {
        kind: "docs_bundle",
        format: "json"
      },
      capabilities: ["docs_search", "docs_direct_read", "resourcepack_trace"]
    },
    payload: {
      "payload/resourcepack-guidance.json": {
        repoPath:
          "packages/docs/resourcepack/1.20.1/payload/resourcepack-guidance.json",
        content: JSON.stringify({
          schemaVersion: 1,
          minecraftVersion: "1.20.1",
          purpose:
            "Turn resource pack requests into traceable model, texture, shader, sound, font, language, and UI evidence.",
          implementationChains: [
            {
              id: "block-model-trace",
              chain: [
                "blockstate json",
                "variant model reference",
                "parent model chain",
                "texture file and optional .mcmeta"
              ]
            }
          ],
          relationshipDiscoveryRules: [
            {
              id: "model-parent-texture-walk",
              start: ["blockstate json", "item model json"],
              follow: ["parent model recursion", "texture variable substitution"]
            }
          ]
        })
      }
    }
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function hashText(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export interface MdmTestRelease {
  artifactName: string;
  sha256: string;
  sizeBytes: number;
}

export interface MdmTestReleaseOut extends MdmTestRelease {
  manifestPath: string;
  body: string;
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
