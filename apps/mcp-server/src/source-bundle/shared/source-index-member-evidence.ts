import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  querySourceIndex,
  type SourceIndexMatch
} from "minecraft-developing-mcp-source-index";

import type { MixinMemberReference } from "../../mod-archive/mixin/mixin-member-signals.js";
import type { MixinTargetMemberEvidence } from "../../mod-archive/mixin/mixin-target-verifier.js";

const DEFAULT_MAX_SOURCE_INDEX_DATABASES = 32;
const DEFAULT_MAX_MEMBER_MATCHES = 8;

export async function collectSourceIndexMemberEvidence(input: {
  runtimeRoot?: string;
  databasePaths?: string[];
  requestedMembers: MixinMemberReference[];
  maxDatabases?: number;
}): Promise<{
  members: MixinTargetMemberEvidence[];
  searchedDatabases: number;
  truncated: boolean;
}> {
  if (input.requestedMembers.length === 0) {
    return { members: [], searchedDatabases: 0, truncated: false };
  }
  if (!input.runtimeRoot && !input.databasePaths?.length) {
    return { members: [], searchedDatabases: 0, truncated: false };
  }

  const maxDatabases = input.maxDatabases ?? DEFAULT_MAX_SOURCE_INDEX_DATABASES;
  const databases = await resolveSourceIndexDatabases({
    runtimeRoot: input.runtimeRoot,
    databasePaths: input.databasePaths,
    maxDatabases
  });
  const members: MixinTargetMemberEvidence[] = [];

  for (const databasePath of databases) {
    for (const reference of input.requestedMembers) {
      members.push(
        ...querySourceIndex({
          databasePath,
          owner: reference.owner,
          member: indexedMemberName(reference),
          memberKind: reference.memberKind,
          limit: DEFAULT_MAX_MEMBER_MATCHES
        }).matches.map(mapSourceIndexMatch)
      );
    }
  }

  return {
    members: dedupeMembers(members),
    searchedDatabases: databases.length,
    truncated: databases.length >= maxDatabases
  };
}

async function resolveSourceIndexDatabases(input: {
  runtimeRoot?: string;
  databasePaths?: string[];
  maxDatabases: number;
}): Promise<string[]> {
  const explicit = uniquePaths(input.databasePaths ?? []);
  const remaining = input.maxDatabases - explicit.length;
  if (!input.runtimeRoot || remaining <= 0) {
    return explicit.slice(0, input.maxDatabases);
  }

  return uniquePaths([
    ...explicit,
    ...(await findSourceIndexDatabases(input.runtimeRoot, remaining))
  ]).slice(0, input.maxDatabases);
}

async function findSourceIndexDatabases(
  runtimeRoot: string,
  maxDatabases: number
): Promise<string[]> {
  const queue = [runtimeRoot];
  const databases: string[] = [];

  while (queue.length > 0 && databases.length < maxDatabases) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    for (const entry of await readDirectoryIfPresent(current)) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          queue.push(path);
        }
      } else if (entry.isFile() && entry.name === "source-index.sqlite") {
        databases.push(path);
      }
    }
  }

  return databases.sort();
}

async function readDirectoryIfPresent(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function mapSourceIndexMatch(match: SourceIndexMatch): MixinTargetMemberEvidence {
  return {
    ownerQualifiedName: match.ownerQualifiedName ?? match.ownerSimpleName ?? "",
    memberName: match.memberName ?? "",
    memberKind: match.memberKind ?? "method",
    path: match.path,
    startLine: match.startLine,
    endLine: match.endLine,
    signature: match.signature,
    returnType: match.returnType
  };
}

function dedupeMembers(
  members: MixinTargetMemberEvidence[]
): MixinTargetMemberEvidence[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    const key = [
      member.ownerQualifiedName,
      member.memberName,
      member.memberKind,
      member.path,
      member.startLine ?? ""
    ].join("#");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function shouldSkipDirectory(name: string): boolean {
  return name === "node_modules" || name === ".git";
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.length > 0))].sort();
}

function indexedMemberName(reference: MixinMemberReference): string {
  if (reference.memberKind !== "constructor") {
    return reference.memberName;
  }

  return reference.owner.split(".").at(-1) ?? reference.memberName;
}
