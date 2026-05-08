import { describe, expect, it } from "vitest";

import * as publicApi from "../../index.js";

describe("minecraft-developing-mcp public api", () => {
  it("keeps the package entrypoint progressive and minimal", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "buildMcpServerBootstrap",
      "buildMcpServerRequestPlan",
      "createMcpSkillServer",
      "executeMcpServerRequest"
    ]);
  });
});
