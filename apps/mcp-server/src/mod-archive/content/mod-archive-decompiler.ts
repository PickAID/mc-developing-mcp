import { mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

import type {
  ArchiveClassOwnerMatch
} from "minecraft-developing-mcp-jar-source-adapter";

const MAX_DECOMPILED_SOURCE_BYTES = 256 * 1024;

export interface ModArchiveDecompiler {
  name: string;
  decompileArchive(input: {
    sourceArchive: string;
    outputRoot: string;
    classOwner: ArchiveClassOwnerMatch;
  }): Promise<void>;
}

export interface ModArchiveDecompileResult {
  status: "ready" | "needs_decompiler" | "not_found" | "too_large";
  decompiler?: string;
  outputRoot?: string;
  javaRelativePath?: string;
  content?: string;
  setup?: string[];
}

export function isModArchiveDecompileRequest(requestText?: string): boolean {
  return Boolean(
    requestText &&
      /\b(?:decompile|decompiled|反编译)\b/i.test(requestText) &&
      /\b(?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*\b/.test(
        requestText
      )
  );
}

export async function decompileModArchiveClass(input: {
  runtimeRoot: string;
  classOwner: ArchiveClassOwnerMatch;
  decompiler?: ModArchiveDecompiler;
  env?: NodeJS.ProcessEnv;
}): Promise<ModArchiveDecompileResult> {
  const decompiler = input.decompiler ?? resolveConfiguredDecompiler(input.env);
  if (!decompiler) {
    return {
      status: "needs_decompiler",
      setup: [
        "Set MC_DEVELOPING_MCP_VINEFLOWER_JAR=/absolute/path/to/vineflower.jar, or",
        "set MC_DEVELOPING_MCP_CFR_JAR=/absolute/path/to/cfr.jar."
      ]
    };
  }

  const outputRoot = buildDecompileOutputRoot(input.runtimeRoot, input.classOwner);
  const javaRelativePath = `${input.classOwner.binaryName.replaceAll(".", "/")}.java`;
  const javaPath = join(outputRoot, javaRelativePath);
  const cached = await readDecompiledJava(javaPath);
  if (cached.status === "ready") {
    return {
      ...cached,
      decompiler: decompiler.name,
      outputRoot,
      javaRelativePath
    };
  }

  await mkdir(dirname(javaPath), { recursive: true });
  await decompiler.decompileArchive({
    sourceArchive: input.classOwner.sourceArchive,
    outputRoot,
    classOwner: input.classOwner
  });

  return {
    ...(await readDecompiledJava(javaPath)),
    decompiler: decompiler.name,
    outputRoot,
    javaRelativePath
  };
}

function resolveConfiguredDecompiler(
  env: NodeJS.ProcessEnv = process.env
): ModArchiveDecompiler | undefined {
  if (env.MC_DEVELOPING_MCP_VINEFLOWER_JAR) {
    return javaJarDecompiler({
      name: "vineflower",
      jarPath: env.MC_DEVELOPING_MCP_VINEFLOWER_JAR,
      args: ({ sourceArchive, outputRoot }) => [
        "-jar",
        env.MC_DEVELOPING_MCP_VINEFLOWER_JAR as string,
        sourceArchive,
        outputRoot
      ]
    });
  }

  if (env.MC_DEVELOPING_MCP_CFR_JAR) {
    return javaJarDecompiler({
      name: "cfr",
      jarPath: env.MC_DEVELOPING_MCP_CFR_JAR,
      args: ({ sourceArchive, outputRoot }) => [
        "-jar",
        env.MC_DEVELOPING_MCP_CFR_JAR as string,
        sourceArchive,
        "--outputdir",
        outputRoot
      ]
    });
  }

  return undefined;
}

function javaJarDecompiler(input: {
  name: string;
  jarPath: string;
  args: (run: {
    sourceArchive: string;
    outputRoot: string;
    classOwner: ArchiveClassOwnerMatch;
  }) => string[];
}): ModArchiveDecompiler {
  return {
    name: input.name,
    async decompileArchive(run) {
      await ensureFile(input.jarPath);
      await mkdir(run.outputRoot, { recursive: true });
      await spawnJava(input.args(run));
    }
  };
}

function buildDecompileOutputRoot(
  runtimeRoot: string,
  classOwner: ArchiveClassOwnerMatch
): string {
  const key = createHash("sha256")
    .update(classOwner.sourceArchive)
    .update("\0")
    .update(classOwner.binaryName)
    .digest("hex")
    .slice(0, 16);

  return join(runtimeRoot, "decompiled-mod-classes", key);
}

async function readDecompiledJava(
  javaPath: string
): Promise<Pick<ModArchiveDecompileResult, "status" | "content">> {
  try {
    const details = await stat(javaPath);
    if (!details.isFile()) {
      return { status: "not_found" };
    }
    if (details.size > MAX_DECOMPILED_SOURCE_BYTES) {
      return { status: "too_large" };
    }

    return {
      status: "ready",
      content: await readFile(javaPath, "utf-8")
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not_found" };
    }

    throw error;
  }
}

async function ensureFile(path: string): Promise<void> {
  const details = await stat(path);
  if (!details.isFile()) {
    throw new Error(`Decompiler path is not a file: ${path}`);
  }
}

function spawnJava(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("java", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stderr: Buffer[] = [];

    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Decompiler exited with code ${code}: ${Buffer.concat(stderr).toString("utf-8").slice(0, 1000)}`
        )
      );
    });
  });
}
