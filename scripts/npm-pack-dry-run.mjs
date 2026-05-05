import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishablePackages } from "./npm-publish-packages.mjs";

const packDestination = mkdtempSync(join(tmpdir(), "mcpskill-pack-dry-run-"));

try {
  for (const packageDir of publishablePackages) {
    const result = spawnSync(
      "pnpm",
      ["--dir", packageDir, "pack", "--pack-destination", packDestination, "--json"],
      {
        encoding: "utf-8",
        stdio: "pipe"
      }
    );

    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }

    const packResult = JSON.parse(result.stdout);
    const packedPackageJson = readPackedPackageJson(packResult.filename);
    const workspaceDependencies = dependencyEntries(packedPackageJson).filter(
      ([, range]) => range.startsWith("workspace:")
    );

    if (workspaceDependencies.length > 0) {
      console.error(
        `${packageDir}: packed package still has workspace dependency ranges: ` +
          workspaceDependencies.map(([name, range]) => `${name}@${range}`).join(", ")
      );
      process.exit(1);
    }

    console.log(
      `${packageDir}: ${packResult.name}@${packResult.version} ` +
        `${packResult.files.length} file(s), dependency ranges rewritten`
    );
  }
} finally {
  rmSync(packDestination, { recursive: true, force: true });
}

function readPackedPackageJson(tarballPath) {
  const result = spawnSync("tar", ["-xOf", tarballPath, "package/package.json"], {
    encoding: "utf-8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function dependencyEntries(packageJson) {
  return [
    ...Object.entries(packageJson.dependencies ?? {}),
    ...Object.entries(packageJson.optionalDependencies ?? {}),
    ...Object.entries(packageJson.peerDependencies ?? {})
  ];
}
