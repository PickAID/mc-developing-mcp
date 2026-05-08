import {
  listArchiveContent,
  readArchiveContentFile,
  type ArchiveContentCache
} from "minecraft-developing-mcp-jar-source-adapter";

import {
  parseAccessWidenerTargets,
  type AccessWidenerTarget
} from "./access-widener-targets.js";
import type { MixinTargetMemberEvidence } from "../mixin/mixin-target-verifier.js";
import {
  CLASS_OWNER_IGNORED_PACKAGE_PREFIXES,
  DEFAULT_MAX_ARCHIVES
} from "../content/mod-archive-content-constants.js";

const MAX_AW_METADATA_ENTRIES = 16;
const MAX_AW_READ_FILES = 4;
const MAX_AW_TARGETS = 16;
const MAX_AW_BYTES_PER_FILE = 32_768;
const AW_EVIDENCE_WARNINGS = [
  "mappingNamespaceTranslation=unavailable: AW/ClassTweaker namespaces are reported from file headers only.",
  "applicabilityProofLevel=parser_only: AW/ClassTweaker targets are parser evidence, not verified target applicability."
];
const AW_PARTIAL_EVIDENCE_WARNINGS = [
  "mappingNamespaceTranslation=unavailable: AW/ClassTweaker namespaces are reported from file headers only.",
  "applicabilityProofLevel=target_presence: matched targets prove only owner/member presence, not access-transformer semantics."
];
const MIXIN_TARGET_ARCHIVE_IGNORED_PREFIXES = [
  ...CLASS_OWNER_IGNORED_PACKAGE_PREFIXES,
  "net.minecraft.",
  "com.mojang."
];

interface CompactAccessWidenerTarget {
  kind: "class" | "method" | "field";
  access: "accessible" | "extendable" | "mutable";
  transitive: boolean;
  owner: string;
  name?: string;
  descriptor?: string;
  mappingNamespaceTranslation: "unavailable";
  applicabilityStatus: "unknown" | "present";
  applicabilityProofLevel: "parser_only" | "target_presence";
  targetPresenceProof?: {
    evidenceKind: "source_index_member";
    owner: string;
    member?: string;
    path?: string;
    signature?: string;
  };
}

export async function collectAccessWidenerTargetEvidence(input: {
  archivePaths: string[];
  cache?: ArchiveContentCache;
  targetEvidence?: {
    availableMembers?: MixinTargetMemberEvidence[];
  };
}): Promise<{
  namespaceTranslation: false;
  namespaceTranslationStatus: "unavailable";
  mappingNamespaceTranslation: "unavailable";
  semanticVerification: false;
  applicabilityStatus: "unknown" | "partial";
  applicabilityProofLevel: "parser_only" | "target_presence";
  warnings: string[];
  files: Array<{
    sourceArchive: string;
    path: string;
    fileKind: "accesswidener" | "classtweaker";
    header?: { version: "v1" | "v2"; namespace: string };
    targets: Array<{
      kind: "class" | "method" | "field";
      access: "accessible" | "extendable" | "mutable";
      transitive: boolean;
      owner: string;
      name?: string;
      descriptor?: string;
      mappingNamespaceTranslation: "unavailable";
      applicabilityStatus: "unknown" | "present";
      applicabilityProofLevel: "parser_only" | "target_presence";
      targetPresenceProof?: {
        evidenceKind: "source_index_member";
        owner: string;
        member?: string;
        path?: string;
        signature?: string;
      };
    }>;
    diagnosticCount: number;
    ignoredTargetCount: number;
    truncated: boolean;
  }>;
  fileCount: number;
  targetCount: number;
  skippedFiles: number;
  searchedArchives: number;
  truncated: boolean;
}> {
  const archives = input.archivePaths.slice(0, DEFAULT_MAX_ARCHIVES);
  const files = [];
  let targetCount = 0;
  let skippedFiles = 0;
  let truncated = input.archivePaths.length > DEFAULT_MAX_ARCHIVES;
  let targetPresenceCount = 0;
  const evidence = normalizeTargetEvidence(input.targetEvidence);

  for (const sourceArchive of archives) {
    const listed = await listArchiveContent({
      sourceArchive,
      domains: ["metadata"],
      limit: MAX_AW_METADATA_ENTRIES,
      cache: input.cache
    });
    truncated = truncated || listed.truncated;

    for (const entry of listed.entries.filter(isAccessWidenerMetadataPath)) {
      if (files.length >= MAX_AW_READ_FILES || targetCount >= MAX_AW_TARGETS) {
        truncated = true;
        break;
      }

      const read = await readArchiveContentFile({
        sourceArchive,
        relativePath: entry.relativePath,
        maxBytes: MAX_AW_BYTES_PER_FILE,
        cache: input.cache
      });
      if (!read.content) {
        skippedFiles += 1;
        truncated = true;
        continue;
      }

      const parsed = parseAccessWidenerTargets(read.content);
      const compactTargets = [];
      let ignoredTargetCount = 0;
      let fileTruncated = false;

      for (const target of parsed.targets) {
        const compactTarget = applyTargetPresenceProof(
          compactAccessWidenerTarget(target),
          evidence
        );
        if (!isMixinArchiveTarget(compactTarget.owner)) {
          ignoredTargetCount += 1;
          continue;
        }
        if (targetCount >= MAX_AW_TARGETS) {
          truncated = true;
          fileTruncated = true;
          break;
        }
        compactTargets.push(compactTarget);
        if (compactTarget.applicabilityProofLevel === "target_presence") {
          targetPresenceCount += 1;
        }
        targetCount += 1;
      }

      files.push({
        sourceArchive,
        path: entry.relativePath,
        fileKind: accessWidenerFileKind(entry.relativePath),
        header: parsed.header,
        targets: compactTargets,
        diagnosticCount: parsed.diagnostics.length,
        ignoredTargetCount,
        truncated: fileTruncated
      });
    }
  }

  return {
    namespaceTranslation: false,
    namespaceTranslationStatus: "unavailable",
    mappingNamespaceTranslation: "unavailable",
    semanticVerification: false,
    applicabilityStatus: targetPresenceCount > 0 ? "partial" : "unknown",
    applicabilityProofLevel: targetPresenceCount > 0
      ? "target_presence"
      : "parser_only",
    warnings: files.length > 0
      ? targetPresenceCount > 0
        ? AW_PARTIAL_EVIDENCE_WARNINGS
        : AW_EVIDENCE_WARNINGS
      : [],
    files,
    fileCount: files.length,
    targetCount,
    skippedFiles,
    searchedArchives: archives.length,
    truncated
  };
}

function isAccessWidenerMetadataPath(entry: { relativePath: string }): boolean {
  return /\.(?:accesswidener|classtweaker)$/i.test(entry.relativePath);
}

function accessWidenerFileKind(path: string): "accesswidener" | "classtweaker" {
  return path.toLowerCase().endsWith(".classtweaker")
    ? "classtweaker"
    : "accesswidener";
}

function compactAccessWidenerTarget(
  target: AccessWidenerTarget
): CompactAccessWidenerTarget {
  const base = {
    kind: target.kind,
    access: target.access,
    transitive: target.transitive,
    owner: target.owner.replaceAll("/", "."),
    mappingNamespaceTranslation: "unavailable" as const,
    applicabilityStatus: "unknown" as const,
    applicabilityProofLevel: "parser_only" as const
  };
  return target.kind === "class"
    ? base
    : {
        ...base,
        name: target.name,
        descriptor: target.descriptor
      };
}

function applyTargetPresenceProof(
  target: CompactAccessWidenerTarget,
  evidence: NormalizedTargetEvidence
): CompactAccessWidenerTarget {
  if (target.kind !== "class") {
    const member = evidence.members.find((candidate) =>
      candidate.owner === target.owner
      && candidate.name === target.name
      && candidate.kind === target.kind
    );
    if (member) {
      return {
        ...target,
        applicabilityStatus: "present",
        applicabilityProofLevel: "target_presence",
        targetPresenceProof: {
          evidenceKind: "source_index_member",
          owner: target.owner,
          member: target.name,
          path: member.path,
          signature: member.signature
        }
      };
    }
  }

  return target;
}

interface NormalizedTargetEvidence {
  members: Array<{
    owner: string;
    name: string;
    kind: "method" | "field";
    path: string;
    signature?: string;
  }>;
}

function normalizeTargetEvidence(
  evidence: {
    availableMembers?: MixinTargetMemberEvidence[];
  } | undefined
): NormalizedTargetEvidence {
  return {
    members: (evidence?.availableMembers ?? [])
      .filter((member) =>
        member.memberKind === "method" || member.memberKind === "field"
      )
      .map((member) => ({
        owner: normalizeClassName(member.ownerQualifiedName),
        name: member.memberName,
        kind: member.memberKind as "method" | "field",
        path: member.path,
        signature: member.signature
      }))
  };
}

function isMixinArchiveTarget(className: string): boolean {
  return !MIXIN_TARGET_ARCHIVE_IGNORED_PREFIXES.some((prefix) =>
    className.startsWith(prefix)
  );
}

function normalizeClassName(className: string): string {
  return className.trim().replaceAll("/", ".");
}
