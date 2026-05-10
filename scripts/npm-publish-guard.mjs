import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { publishablePackages } from "./npm-publish-packages.mjs";

const repoRoot = process.cwd();
const publishableSet = new Set(publishablePackages);
const packageNames = new Map();
const failures = [];
const forbiddenPublicDependencyPrefixes = [
  // Guard against accidentally reintroducing the retired scoped prerelease packages.
  "@mcpskill/",
  "minecraft-developing-mcp-"
];
const releaseMode = process.env.MC_DEVELOPING_MCP_RELEASE === "1";

for (const packageDir of publishablePackages) {
  const packageJsonPath = join(repoRoot, packageDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  packageNames.set(packageJson.name, packageDir);
}

for (const packageDir of publishablePackages) {
  checkPackage(packageDir);
}

if (failures.length > 0) {
  console.error("npm publish guard failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `npm publish guard passed for ${publishablePackages.length} package(s)` +
    (releaseMode ? " in release mode." : ".")
);

function checkPackage(packageDir) {
  const packageJsonPath = join(repoRoot, packageDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  const label = `${packageJson.name} (${packageDir})`;
  const distRoot = join(repoRoot, packageDir, "dist");

  expect(packageJson.private !== true, `${label} must not be private`);
  expect(packageJson.version?.match(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/), `${label} must have a semver version`);
  expect(
    !releaseMode || packageJson.version !== "0.0.0",
    `${label} must not publish release version 0.0.0`
  );
  expect(packageJson.type === "module", `${label} must be ESM`);
  expect(packageJson.files?.length === 1 && packageJson.files[0] === "dist", `${label} must publish only dist through files`);
  expect(packageJson.publishConfig?.access === "public", `${label} must publish with public access`);
  expect(packageJson.repository?.url, `${label} must declare repository`);
  expect(packageJson.repository?.directory === packageDir, `${label} must declare repository.directory`);
  expect(packageJson.author === "m1hono", `${label} must declare author m1hono`);
  expect(typeof packageJson.license === "string", `${label} must declare a license field`);
  expect(existsSync(distRoot), `${label} must be built before packing`);
  expectExists(packageJson.main, packageDir, label, "main");
  expect(!packageJson.types, `${label} must not publish declarations that expose internal workspace package names`);

  for (const [binName, binPath] of Object.entries(packageJson.bin ?? {})) {
    expectExists(binPath, packageDir, label, `bin ${binName}`);
  }

  for (const dependencyName of internalDependencyNames(packageJson)) {
    const dependencyDir = packageNames.get(dependencyName);
    expect(!dependencyDir, `${label} must bundle internal package ${dependencyName} instead of publishing it as an npm dependency`);
    expect(!publishableSet.has(dependencyDir), `${label} dependency ${dependencyName} is inside publishable closure but should not be public`);
  }

  for (const filePath of walkFiles(distRoot)) {
    const rel = relative(join(repoRoot, packageDir), filePath).split("/").join("/");
    expect(!rel.endsWith(".test.js"), `${label} includes test JS output ${rel}`);
    expect(!rel.endsWith(".test.d.ts"), `${label} includes test type output ${rel}`);
    expect(!rel.endsWith(".test-support.js"), `${label} includes test-support JS output ${rel}`);
    expect(!rel.endsWith(".test-support.d.ts"), `${label} includes test-support type output ${rel}`);
    expect(
      !rel.endsWith(".ts") || rel.endsWith(".d.ts"),
      `${label} includes TypeScript source ${rel}`
    );
    expect(!rel.endsWith(".d.ts"), `${label} includes declaration output ${rel}`);
  }

  for (const [dependencyName] of dependencyEntries(packageJson)) {
    expect(
      !isInternalDependencyName(dependencyName),
      `${label} exposes internal dependency ${dependencyName}`
    );
  }
}

function internalDependencyNames(packageJson) {
  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {})
  ].filter(isInternalDependencyName);
}

function isInternalDependencyName(name) {
  return forbiddenPublicDependencyPrefixes.some((prefix) => name.startsWith(prefix));
}

function dependencyEntries(packageJson) {
  return [
    ...Object.entries(packageJson.dependencies ?? {}),
    ...Object.entries(packageJson.peerDependencies ?? {}),
    ...Object.entries(packageJson.optionalDependencies ?? {})
  ];
}

function expectExists(packagePath, packageDir, label, fieldName) {
  expect(typeof packagePath === "string", `${label} must declare ${fieldName}`);
  if (typeof packagePath !== "string") {
    return;
  }
  expect(existsSync(join(repoRoot, packageDir, packagePath)), `${label} ${fieldName} does not exist: ${packagePath}`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function walkFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);

    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
