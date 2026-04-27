import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { constants } from "node:fs";

import type { ExecutableResolver } from "./types.js";

export interface ResolvedJavaRuntime {
  readonly javaHome?: string;
  readonly javaExecutable?: string;
}

export async function resolveJdtlsExecutable(
  env: NodeJS.ProcessEnv,
  executableResolver: ExecutableResolver
): Promise<string | undefined> {
  if (env.JDTLS_PATH) {
    return env.JDTLS_PATH;
  }

  return executableResolver("jdtls", env);
}

export async function resolveJavaRuntime(
  env: NodeJS.ProcessEnv,
  executableResolver: ExecutableResolver
): Promise<ResolvedJavaRuntime> {
  if (env.JAVA_HOME) {
    return {
      javaHome: env.JAVA_HOME,
      javaExecutable: join(env.JAVA_HOME, "bin", platformExecutableName("java"))
    };
  }

  return {
    javaExecutable: await executableResolver("java", env)
  };
}

export const defaultExecutableResolver: ExecutableResolver = async (name, env) => {
  const pathValue = env.PATH ?? "";
  const extensions = executableExtensions(env);

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
};

function platformExecutableName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function executableExtensions(env: NodeJS.ProcessEnv): readonly string[] {
  if (process.platform !== "win32") {
    return [""];
  }

  const pathExt = env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  return pathExt.split(";").filter(Boolean).map((extension) => extension.toLowerCase());
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
