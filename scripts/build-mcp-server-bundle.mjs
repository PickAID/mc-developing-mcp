import { rmSync } from "node:fs";
import { join } from "node:path";

import { build } from "esbuild";

const repoRoot = process.cwd().endsWith("apps/mcp-server")
  ? join(process.cwd(), "../..")
  : process.cwd();
const appRoot = join(repoRoot, "apps/mcp-server");
const distRoot = join(appRoot, "dist");

rmSync(distRoot, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22.5",
  format: "esm",
  sourcemap: false,
  packages: "bundle",
  external: [
    "@modelcontextprotocol/sdk",
    "@modelcontextprotocol/sdk/*",
    "typescript",
    "zod"
  ],
  logLevel: "info"
};

await build({
  ...common,
  entryPoints: [join(appRoot, "src/stdio.ts")],
  outfile: join(distRoot, "stdio.js")
});

await build({
  ...common,
  entryPoints: [join(appRoot, "src/index.ts")],
  outfile: join(distRoot, "index.js")
});
