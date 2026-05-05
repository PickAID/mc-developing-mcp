import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  querySourceIndex,
  type SourceIndexMatch
} from "@mcpskill/source-index";

import type { MixinMemberReference } from "../../mod-archive/mixin/mixin-member-signals.js";
import type { MixinTargetMemberEvidence } from "../../mod-archive/mixin/mixin-target-verifier.js";

const DEFAULT_MAX_SOURCE_INDEX_DATABASES = 32;
const DEFAULT_MAX_MEMBER_MATCHES = 8;

export async function collectSourceIndexMemberEvidence(input: {
  runtimeRoot?: string;
  requestedMembers: MixinMemberReference[];
  maxDatabases?: number;
}): Promise<{
  members: MixinTargetMemberEvidence[];
  searchedDatabases: number;
  truncated: boolean;
}> {
  if (!input.runtimeRoot || input.requestedMembers.length === 0) {
    return { members: [], searchedDatabases: 0, truncated: false };
  }

  const databases = await findSourceIndexDatabases(
    input.runtimeRoot,
    input.maxDatabases ?? DEFAULT_MAX_SOURCE_INDEX_DATABASES
  );
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
    truncated: databases.length >= (input.maxDatabases ?? DEFAULT_MAX_SOURCE_INDEX_DATABASES)
  };
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

function indexedMemberName(reference: MixinMemberReference): string {
  if (reference.memberKind !== "constructor") {
    return reference.memberName;
  }

  return reference.owner.split(".").at(-1) ?? reference.memberName;
}
