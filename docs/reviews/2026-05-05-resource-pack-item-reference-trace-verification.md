# Resource-Pack Item Reference Trace Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice adds `assets/<namespace>/items/**/*.json` as an explicit resource
reference trace start point.

Implemented behavior:

- local resource-pack/datapack adapter traces item definition `model` references;
- generated vanilla resource-pack packages can trace `items/**` to model and texture evidence;
- mod archive and nested JarJar resource traces can start from `items/**`;
- MCP keeps the same public surface and reuses `mc_develop`, `source.bundle`, and `mod_archive_content`.

No public MCP tool was added.

## Actual Returned Values

Smoke command:

```sh
$ node --input-type=module <<'NODE'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { traceDatapackResourceReferences } from './packages/datapack-adapter/dist/index.js';
import { traceModArchiveResourceReferences } from './packages/jar-source-adapter/dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'mcpskill-item-trace-smoke-'));
await writeText(join(root, 'assets/demo/items/gear.json'), '{"model":{"type":"minecraft:model","model":"demo:item/gear"}}\n');
await writeText(join(root, 'assets/demo/models/item/gear.json'), '{"textures":{"layer0":"demo:item/gear"}}\n');
await writeText(join(root, 'assets/demo/textures/item/gear.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

const localTrace = await traceDatapackResourceReferences(root, {
  paths: ['assets/demo/items/gear.json']
});
console.log('LOCAL_ITEM_TRACE=' + JSON.stringify(localTrace, null, 2));

const archivePath = join(root, 'content-mod.jar');
await writeFile(archivePath, createZip([
  {
    name: 'assets/demo/items/gear.json',
    content: '{"model":{"type":"minecraft:model","model":"demo:item/gear"}}\n',
    compressionMethod: 0
  },
  {
    name: 'assets/demo/models/item/gear.json',
    content: '{"textures":{"layer0":"demo:item/gear"}}\n',
    compressionMethod: 8
  },
  {
    name: 'assets/demo/textures/item/gear.png',
    content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    compressionMethod: 0
  }
]));
const archiveTrace = await traceModArchiveResourceReferences({
  sourceArchive: archivePath,
  startPaths: ['assets/demo/items/gear.json']
});
console.log('ARCHIVE_ITEM_TRACE=' + JSON.stringify(archiveTrace, null, 2));

async function writeText(path, content) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    const compressed = entry.compressionMethod === 8 ? deflateRawSync(content) : content;
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.compressionMethod, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
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
NODE
```

Local resource-pack item trace returned:

```json
{
  "startPaths": ["assets/demo/items/gear.json"],
  "references": [
    {
      "fromPath": "assets/demo/items/gear.json",
      "fromKind": "items",
      "relation": "item_model",
      "value": "demo:item/gear",
      "toPath": "assets/demo/models/item/gear.json",
      "toKind": "models",
      "status": "resolved"
    },
    {
      "fromPath": "assets/demo/models/item/gear.json",
      "fromKind": "models",
      "relation": "model_texture",
      "value": "demo:item/gear",
      "toPath": "assets/demo/textures/item/gear.png",
      "toKind": "textures",
      "status": "resolved"
    }
  ],
  "unresolved": [],
  "skipped": [],
  "truncated": false
}
```

Mod archive item trace returned:

```json
{
  "sourceArchive": "/var/folders/.../mcpskill-item-trace-smoke-.../content-mod.jar",
  "startPaths": ["assets/demo/items/gear.json"],
  "references": [
    {
      "fromPath": "assets/demo/items/gear.json",
      "fromKind": "items",
      "relation": "item_model",
      "value": "demo:item/gear",
      "toPath": "assets/demo/models/item/gear.json",
      "toKind": "models",
      "status": "resolved"
    },
    {
      "fromPath": "assets/demo/models/item/gear.json",
      "fromKind": "models",
      "relation": "model_texture",
      "value": "demo:item/gear",
      "toPath": "assets/demo/textures/item/gear.png",
      "toKind": "textures",
      "status": "resolved"
    }
  ],
  "unresolved": [],
  "skipped": [],
  "truncated": false
}
```

## TDD Record

RED focused test run before implementation:

```text
$ pnpm exec vitest run packages/datapack-adapter/src/index.test.ts packages/jar-source-adapter/src/mod-archive-resource-references.test.ts apps/mcp-server/src/source-bundle-resource-pack-items-trace.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts apps/mcp-server/src/mod-archive-resource-references.test.ts

Test Files  5 failed (5)
Tests       5 failed | 15 passed (20)

Expected failures:
- local adapter returned no references for assets/demo/items/gear.json
- generated vanilla assets returned no resourceReferenceTrace for items/stone.json
- MCP local source.bundle returned no resourceReferenceTrace for items/gear.json
- mod archive adapter filtered item start paths out
- MCP mod archive executor fell back to normal read instead of resource_reference_trace
```

GREEN focused verification after implementation:

```text
$ pnpm exec vitest run packages/datapack-adapter/src/index.test.ts packages/jar-source-adapter/src/mod-archive-resource-references.test.ts apps/mcp-server/src/source-bundle-resource-pack-items-trace.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts apps/mcp-server/src/mod-archive-resource-references.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/jar-source-adapter/src/mod-archive-resource-references.test.ts (4 tests) 12ms
✓ packages/datapack-adapter/src/index.test.ts (10 tests) 42ms
✓ apps/mcp-server/src/mod-archive-resource-references.test.ts (3 tests) 21ms
✓ apps/mcp-server/src/source-bundle-resource-pack-items-trace.test.ts (1 test) 14ms
✓ apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts (3 tests) 32ms

Test Files  5 passed (5)
Tests       21 passed (21)
Duration    452ms
```

## Full Verification

Full workspace test:

```text
$ pnpm test

Test Files  134 passed (134)
Tests       431 passed (431)
Duration    3.48s
```

Line-count guard:

```text
$ find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'

# no output
```

Focused file line counts:

```text
$ wc -l packages/datapack-adapter/src/index.test.ts packages/jar-source-adapter/src/mod-archive-resource-references.test.ts apps/mcp-server/src/source-bundle-resource-pack-items-trace.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts apps/mcp-server/src/mod-archive-resource-references.test.ts packages/jar-source-adapter/src/mod-archive-resource-references.ts

417 packages/datapack-adapter/src/index.test.ts
308 packages/jar-source-adapter/src/mod-archive-resource-references.test.ts
101 apps/mcp-server/src/source-bundle-resource-pack-items-trace.test.ts
421 apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts
303 apps/mcp-server/src/mod-archive-resource-references.test.ts
390 packages/jar-source-adapter/src/mod-archive-resource-references.ts
1940 total
```

Whitespace guard:

```text
$ git diff --check

# no output
```

Go cleanup guard:

```text
$ find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print

# no output
```

## Notes

This is intentionally a resource evidence parity slice, not full item model
schema validation. The new `item_model` relation only traces explicit `model`
string references under budget and then reuses the existing model parent/texture
trace path.
