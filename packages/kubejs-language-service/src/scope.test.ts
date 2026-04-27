import { describe, expect, it } from "vitest";

import { classifyKubeJsScriptScope } from "./scope.js";

describe("classifyKubeJsScriptScope", () => {
  it("maps KubeJS script paths to runtime scopes", () => {
    const workspaceRoot = "/pack";

    expect(
      classifyKubeJsScriptScope(
        "/pack/kubejs/server_scripts/example.js",
        workspaceRoot
      )
    ).toBe("server");
    expect(
      classifyKubeJsScriptScope(
        "/pack/kubejs/startup_scripts/example.js",
        workspaceRoot
      )
    ).toBe("startup");
    expect(
      classifyKubeJsScriptScope(
        "/pack/kubejs/client_scripts/example.js",
        workspaceRoot
      )
    ).toBe("client");
    expect(
      classifyKubeJsScriptScope(
        "/pack/local/kubejs/server_scripts/example.js",
        workspaceRoot
      )
    ).toBe("server");
    expect(
      classifyKubeJsScriptScope("/pack/kubejs/lib/helpers.js", workspaceRoot)
    ).toBe("shared");
  });
});
