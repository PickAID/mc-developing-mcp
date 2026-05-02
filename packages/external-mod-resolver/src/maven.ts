import type {
  ExternalModGradleUsage,
  ExternalModMavenArtifact
} from "./types.js";

export function buildModrinthMavenArtifact(input: {
  slug: string;
  projectId: string;
  versionId: string;
  versionNumber: string;
}): ExternalModMavenArtifact {
  return buildMavenArtifact({
    source: "modrinth-maven",
    repositoryName: "Modrinth Maven",
    repositoryUrl: "https://api.modrinth.com/maven",
    group: "maven.modrinth",
    artifact: input.slug,
    version: input.versionId,
    aliases: [
      `maven.modrinth:${input.slug}:${input.versionNumber}`,
      `maven.modrinth:${input.projectId}:${input.versionId}`,
      `maven.modrinth:${input.projectId}:${input.versionNumber}`
    ]
  });
}

export function buildCurseMavenArtifact(input: {
  slug: string;
  projectId: string;
  fileId: string;
}): ExternalModMavenArtifact {
  return buildMavenArtifact({
    source: "cursemaven",
    repositoryName: "CurseMaven",
    repositoryUrl: "https://cursemaven.com",
    group: "curse.maven",
    artifact: `${input.slug}-${input.projectId}`,
    version: input.fileId,
    aliases: []
  });
}

function buildMavenArtifact(input: {
  source: ExternalModMavenArtifact["source"];
  repositoryName: string;
  repositoryUrl: string;
  group: string;
  artifact: string;
  version: string;
  aliases: string[];
}): ExternalModMavenArtifact {
  const coordinates = `${input.group}:${input.artifact}:${input.version}`;

  return {
    source: input.source,
    repositoryName: input.repositoryName,
    repositoryUrl: input.repositoryUrl,
    group: input.group,
    artifact: input.artifact,
    version: input.version,
    coordinates,
    aliases: input.aliases,
    gradle: buildGradleUsage(input.repositoryUrl, coordinates)
  };
}

function buildGradleUsage(
  repositoryUrl: string,
  coordinates: string
): ExternalModGradleUsage {
  return {
    repositoryGroovy: `maven { url = "${repositoryUrl}" }`,
    repositoryKotlin: `maven("${repositoryUrl}")`,
    loom: {
      modImplementation: `modImplementation "${coordinates}"`,
      modCompileOnly: `modCompileOnly "${coordinates}"`,
      modRuntimeOnly: `modRuntimeOnly "${coordinates}"`,
      modLocalRuntime: `modLocalRuntime "${coordinates}"`
    },
    forgeGradle: {
      implementationFgDeobf: `implementation fg.deobf("${coordinates}")`,
      compileOnlyFgDeobf: `compileOnly fg.deobf("${coordinates}")`,
      runtimeOnlyFgDeobf: `runtimeOnly fg.deobf("${coordinates}")`
    }
  };
}
