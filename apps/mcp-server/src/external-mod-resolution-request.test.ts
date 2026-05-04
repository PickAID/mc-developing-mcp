import { describe, expect, it } from "vitest";

import { parseExternalModRequest } from "./external-mod-resolution-request.js";

describe("parseExternalModRequest", () => {
  it("extracts a Modrinth slug from a project URL", () => {
    expect(
      parseExternalModRequest(
        "Resolve https://modrinth.com/mod/sodium for fabric 1.20.1."
      )
    ).toMatchObject({
      platform: "modrinth",
      query: "sodium",
      loader: "fabric",
      minecraftVersion: "1.20.1"
    });
  });

  it("extracts a Modrinth slug from a version URL", () => {
    expect(
      parseExternalModRequest(
        "Find maven info for https://modrinth.com/mod/sodium/version/OihdIimA fabric 1.20.1."
      )
    ).toMatchObject({
      platform: "modrinth",
      query: "sodium",
      loader: "fabric",
      minecraftVersion: "1.20.1"
    });
  });

  it("extracts a CurseForge slug from a project URL", () => {
    expect(
      parseExternalModRequest(
        "Find CurseMaven for https://www.curseforge.com/minecraft/mc-mods/jei forge 1.20.1."
      )
    ).toMatchObject({
      platform: "curseforge",
      query: "jei",
      loader: "forge",
      minecraftVersion: "1.20.1"
    });
  });

  it("extracts a CurseForge slug from a file URL", () => {
    expect(
      parseExternalModRequest(
        "Resolve https://www.curseforge.com/minecraft/mc-mods/jei/files/5528825 for forge 1.20.1."
      )
    ).toMatchObject({
      platform: "curseforge",
      query: "jei",
      loader: "forge",
      minecraftVersion: "1.20.1"
    });
  });

  it("extracts an explicit CurseForge slug constraint", () => {
    expect(
      parseExternalModRequest(
        "Find CurseMaven for slug jei forge 1.20.1."
      )
    ).toMatchObject({
      platform: "curseforge",
      slug: "jei",
      query: "jei",
      loader: "forge",
      minecraftVersion: "1.20.1"
    });
  });

  it("extracts an explicit CurseForge project id constraint", () => {
    expect(
      parseExternalModRequest(
        "Find CurseMaven for project id 238222 forge 1.20.1."
      )
    ).toMatchObject({
      platform: "curseforge",
      projectId: "238222",
      query: "238222",
      loader: "forge",
      minecraftVersion: "1.20.1"
    });
  });

  it("keeps multi-word natural mod names before loader and version constraints", () => {
    expect(
      parseExternalModRequest(
        "Find the CurseForge mod Just Enough Items forge 1.20.1."
      )
    ).toMatchObject({
      platform: "curseforge",
      query: "just enough items",
      loader: "forge",
      minecraftVersion: "1.20.1"
    });
  });

  it("drops conversational lead-in words from natural mod names", () => {
    expect(
      parseExternalModRequest(
        "Can you please find the Modrinth mod Architectury API fabric 1.20.1?"
      )
    ).toMatchObject({
      platform: "modrinth",
      query: "architectury api",
      loader: "fabric",
      minecraftVersion: "1.20.1"
    });
  });

  it("uses crash loader mod ids with workspace runtime defaults", () => {
    expect(
      parseExternalModRequest(
        [
          "The modpack crashes during startup.",
          "Crash log loader mod ids: fabric-api"
        ].join("\n"),
        { loader: "fabric", minecraftVersion: "1.20.1" }
      )
    ).toMatchObject({
      platform: "modrinth",
      query: "fabric-api",
      loader: "fabric",
      minecraftVersion: "1.20.1"
    });
  });

  it("extracts crash loader dependency details with runtime defaults", () => {
    expect(
      parseExternalModRequest(
        [
          "The modpack crashes during startup.",
          "Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=0.92.2 or later; actual=0.91.0; kind=incompatible_dependency"
        ].join("\n"),
        { loader: "fabric", minecraftVersion: "1.20.1" }
      )
    ).toMatchObject({
      platform: "modrinth",
      query: "fabric-api",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      loaderDependency: {
        modId: "fabric-api",
        requestedBy: "demo_addon",
        expectedRange: "0.92.2 or later",
        actualVersion: "0.91.0",
        kind: "incompatible_dependency"
      }
    });
  });
});
