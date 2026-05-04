import { describe, expect, it } from "vitest";

import {
  classifyKubeJsScriptScope,
  inferKubeJSScriptScope
} from "./scope.js";

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

describe("inferKubeJSScriptScope", () => {
  it("infers high-confidence scope from KubeJS script directories", () => {
    expect(
      inferKubeJSScriptScope({
        selectedPath: "/pack/kubejs/startup_scripts/registry.js"
      })
    ).toMatchObject({
      scope: "startup",
      confidence: "high",
      reasons: ["selectedPath matched kubejs/startup_scripts"]
    });
    expect(
      inferKubeJSScriptScope({
        selectedPath: "/pack/kubejs/server_scripts/recipes.js"
      })
    ).toMatchObject({
      scope: "server",
      confidence: "high",
      reasons: ["selectedPath matched kubejs/server_scripts"]
    });
    expect(
      inferKubeJSScriptScope({
        selectedPath: "/pack/kubejs/client_scripts/hud.js"
      })
    ).toMatchObject({
      scope: "client",
      confidence: "high",
      reasons: ["selectedPath matched kubejs/client_scripts"]
    });
  });

  it("infers medium-confidence scope from request text", () => {
    expect(
      inferKubeJSScriptScope({
        request: "Add a startup lifecycle registry script"
      })
    ).toMatchObject({
      scope: "startup",
      confidence: "medium",
      reasons: [
        "request mentioned startup",
        "request mentioned lifecycle startup context"
      ]
    });
    expect(
      inferKubeJSScriptScope({ request: "fix server recipe events" })
    ).toMatchObject({
      scope: "server",
      confidence: "medium",
      reasons: ["request mentioned server"]
    });
    expect(
      inferKubeJSScriptScope({ request: "update client tooltip rendering" })
    ).toMatchObject({
      scope: "client",
      confidence: "medium",
      reasons: ["request mentioned client"]
    });
  });

  it("reports mismatch when selected path and request text disagree", () => {
    expect(
      inferKubeJSScriptScope({
        request: "add a server recipe handler",
        selectedPath: "/pack/kubejs/client_scripts/tooltips.js"
      })
    ).toEqual({
      scope: "client",
      confidence: "medium",
      reasons: [
        "selectedPath matched kubejs/client_scripts",
        "request mentioned server",
        "selectedPath and request imply different scopes"
      ],
      mismatch: {
        requested: "server",
        selected: "client"
      }
    });
  });

  it("returns unknown when neither path nor request names a scope", () => {
    expect(
      inferKubeJSScriptScope({
        request: "help with this script",
        selectedPath: "/pack/kubejs/lib/helpers.js"
      })
    ).toEqual({
      scope: "unknown",
      confidence: "unknown",
      reasons: ["no KubeJS scope signal found"]
    });
  });
});
