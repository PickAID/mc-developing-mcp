import { describe, expect, it } from "vitest";

import * as publicApi from "../../index.js";

describe("@mcpskill/mcp-server public api", () => {
  it("keeps the package entrypoint progressive and minimal", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "buildMcpServerBootstrap",
      "buildMcpServerRequestPlan",
      "createMcpSkillServer",
      "executeMcpServerRequest"
    ]);
  });
});
