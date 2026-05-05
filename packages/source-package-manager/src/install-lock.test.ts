import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inspectSourcePackageInstallLock } from "./install-lock.js";

describe("source package install lock inspection", () => {
  it("reports a missing install lock as absent", async () => {
    const lockDir = join(
      await mkdtemp(join(tmpdir(), "mcpskill-install-lock-root-")),
      "missing.lock"
    );

    await expect(inspectSourcePackageInstallLock(lockDir)).resolves.toMatchObject({
      exists: false,
      stale: false
    });
  });

  it("reports an old install lock as stale without deleting it", async () => {
    const lockDir = await mkdtemp(join(tmpdir(), "mcpskill-install-lock-"));
    await writeFile(
      join(lockDir, "owner.json"),
      `${JSON.stringify({
        packageId: "minecraft-1.20.1-source-pack-named",
        pid: 12345,
        acquiredAt: "2026-05-05T00:00:00.000Z"
      })}\n`
    );

    await expect(
      inspectSourcePackageInstallLock(lockDir, {
        now: new Date("2026-05-05T00:45:00.000Z"),
        staleAfterMs: 30 * 60 * 1000
      })
    ).resolves.toMatchObject({
      exists: true,
      owner: expect.stringContaining('"pid":12345'),
      acquiredAt: "2026-05-05T00:00:00.000Z",
      ageMs: 45 * 60 * 1000,
      stale: true,
      staleReason: expect.stringContaining("older than")
    });

    await expect(stat(lockDir)).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
  });
});
