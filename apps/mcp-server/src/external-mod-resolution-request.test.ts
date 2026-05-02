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
});
