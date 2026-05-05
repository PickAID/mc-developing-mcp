import type {
  MixinMemberKind,
  MixinMemberReference
} from "./mixin-member-signals.js";
import { narrowMixinMembersByDescriptor } from "./mixin-descriptor-match.js";

export type MixinTargetVerificationStatus =
  | "valid"
  | "missing_target"
  | "ambiguous_target"
  | "source_unavailable";

export type MixinTargetMemberProofStatus =
  | "valid"
  | "missing_owner"
  | "missing_member"
  | "wrong_member_kind"
  | "ambiguous_member"
  | "source_unavailable";

export type MixinDescriptorProofLevel =
  | "none"
  | "parameter_types"
  | "not_proven";

export type MappingNamespaceTranslationStatus = "unavailable";
export type MixinInjectionPointVerificationStatus = "unavailable";

export interface MixinVerifierBoundaryEvidence {
  mappingNamespaceTranslation: MappingNamespaceTranslationStatus;
  injectionPointSemanticVerification: false;
  injectionPointVerificationStatus: MixinInjectionPointVerificationStatus;
  fullSemanticVerifier: false;
}

export const MIXIN_VERIFIER_BOUNDARY_EVIDENCE: MixinVerifierBoundaryEvidence = {
  mappingNamespaceTranslation: "unavailable",
  injectionPointSemanticVerification: false,
  injectionPointVerificationStatus: "unavailable",
  fullSemanticVerifier: false
};

export interface VerifyMixinTargetInput {
  requestedTarget: string;
  availableClasses: string[];
  availableClassesTruncated?: boolean;
  requestedMembers?: MixinMemberReference[];
  availableMembers?: MixinTargetMemberEvidence[];
}

export interface MixinTargetVerificationResult {
  status: MixinTargetVerificationStatus;
  requestedTarget: string;
  candidates: string[];
  nextReads: string[];
  memberProofs?: MixinTargetMemberProof[];
}

export interface MixinTargetMemberEvidence {
  ownerQualifiedName: string;
  memberName: string;
  memberKind: MixinMemberKind;
  path: string;
  startLine?: number;
  endLine?: number;
  signature?: string;
  returnType?: string;
}

export interface MixinTargetMemberProof {
  status: MixinTargetMemberProofStatus;
  requestedOwner: string;
  requestedMember: string;
  memberKind: MixinMemberKind;
  descriptorProofLevel: MixinDescriptorProofLevel;
  matches: MixinTargetMemberEvidence[];
  candidates: MixinTargetMemberEvidence[];
  nextReads: string[];
}

const MAX_CANDIDATES = 12;

export function verifyMixinTarget(
  input: VerifyMixinTargetInput
): MixinTargetVerificationResult {
  const requestedTarget = normalizeClassName(input.requestedTarget);
  const availableClasses = unique(
    input.availableClasses.map(normalizeClassName).filter(Boolean)
  );

  if (availableClasses.length === 0) {
    return buildResult("source_unavailable", requestedTarget, [], input);
  }

  const exactMatch = availableClasses.find(
    (className) => className === requestedTarget
  );
  if (exactMatch) {
    return buildResult("valid", requestedTarget, [exactMatch], input);
  }

  const candidates = selectCloseCandidates(requestedTarget, availableClasses);
  if (input.availableClassesTruncated) {
    return buildResult("source_unavailable", requestedTarget, candidates, input);
  }

  if (candidates.length > 1) {
    return buildResult("ambiguous_target", requestedTarget, candidates, input);
  }

  return buildResult("missing_target", requestedTarget, candidates, input);
}

function selectCloseCandidates(
  requestedTarget: string,
  availableClasses: string[]
): string[] {
  const requestedPackage = packageNameOf(requestedTarget);
  const requestedSimpleName = simpleNameOf(requestedTarget);
  const prefixMatches = availableClasses.filter((className) => {
    const simpleName = simpleNameOf(className);
    return (
      simpleName.startsWith(requestedSimpleName) ||
      requestedSimpleName.startsWith(simpleName)
    );
  });

  if (prefixMatches.length > 0) {
    return prefixMatches;
  }

  return availableClasses.filter(
    (className) => packageNameOf(className) === requestedPackage
  );
}

function buildResult(
  status: MixinTargetVerificationStatus,
  requestedTarget: string,
  candidates: string[],
  input: VerifyMixinTargetInput
): MixinTargetVerificationResult {
  const result: MixinTargetVerificationResult = {
    status,
    requestedTarget,
    candidates: candidates.slice(0, MAX_CANDIDATES),
    nextReads: []
  };
  const memberProofs = verifyRequestedMembers(input);
  return memberProofs.length > 0
    ? { ...result, memberProofs }
    : result;
}

function verifyRequestedMembers(
  input: VerifyMixinTargetInput
): MixinTargetMemberProof[] {
  const requestedMembers = input.requestedMembers ?? [];
  if (requestedMembers.length === 0) {
    return [];
  }

  const availableMembers = input.availableMembers ?? [];
  const availableClasses = new Set(
    input.availableClasses.map(normalizeClassName).filter(Boolean)
  );

  return requestedMembers.map((reference) =>
    verifyMemberReference(
      reference,
      availableClasses,
      availableMembers,
      input.availableClassesTruncated === true
    )
  );
}

function verifyMemberReference(
  reference: MixinMemberReference,
  availableClasses: Set<string>,
  availableMembers: MixinTargetMemberEvidence[],
  availableClassesTruncated: boolean
): MixinTargetMemberProof {
  const requestedOwner = normalizeClassName(reference.owner);
  const requestedMemberName = indexedMemberName(reference);
  if (availableMembers.length === 0) {
    return buildMemberProof("source_unavailable", reference, [], []);
  }

  const ownerMembers = availableMembers.filter(
    (member) => normalizeClassName(member.ownerQualifiedName) === requestedOwner
  );
  if (ownerMembers.length === 0 && !availableClasses.has(requestedOwner)) {
    if (availableClassesTruncated) {
      return buildMemberProof("source_unavailable", reference, [], []);
    }
    return buildMemberProof("missing_owner", reference, [], []);
  }

  const sameName = ownerMembers.filter(
    (member) => member.memberName === requestedMemberName
  );
  const kindMatches = sameName.filter(
    (member) => member.memberKind === reference.memberKind
  );
  const descriptorMatches = narrowMixinMembersByDescriptor(
    kindMatches,
    reference.descriptor
  );
  const matches = descriptorMatches?.matches ?? kindMatches;
  const descriptorProofLevel = descriptorMatches?.proofLevel
    ?? (reference.descriptor === undefined ? "none" : "not_proven");
  if (matches.length === 1) {
    const status = descriptorMatches && !descriptorMatches.decisive
      ? "ambiguous_member"
      : "valid";
    return buildMemberProof(
      status,
      reference,
      matches,
      sameName,
      descriptorProofLevel
    );
  }
  if (matches.length > 1) {
    return buildMemberProof(
      "ambiguous_member",
      reference,
      matches,
      sameName,
      descriptorProofLevel
    );
  }
  if (kindMatches.length > 0) {
    return buildMemberProof(
      "missing_member",
      reference,
      [],
      sameName,
      descriptorProofLevel
    );
  }
  if (sameName.length > 0) {
    return buildMemberProof("wrong_member_kind", reference, [], sameName);
  }

  return buildMemberProof("missing_member", reference, [], ownerMembers);
}

function buildMemberProof(
  status: MixinTargetMemberProofStatus,
  reference: MixinMemberReference,
  matches: MixinTargetMemberEvidence[],
  candidates: MixinTargetMemberEvidence[],
  descriptorProofLevel: MixinDescriptorProofLevel = defaultDescriptorProofLevel(
    reference
  )
): MixinTargetMemberProof {
  return {
    status,
    requestedOwner: normalizeClassName(reference.owner),
    requestedMember: reference.memberName,
    memberKind: reference.memberKind,
    descriptorProofLevel,
    matches: matches.slice(0, MAX_CANDIDATES),
    candidates: candidates.slice(0, MAX_CANDIDATES),
    nextReads: matches.flatMap(buildMemberNextReads).slice(0, MAX_CANDIDATES)
  };
}

function defaultDescriptorProofLevel(
  reference: MixinMemberReference
): MixinDescriptorProofLevel {
  return reference.descriptor === undefined ? "none" : "not_proven";
}

function buildMemberNextReads(member: MixinTargetMemberEvidence): string[] {
  if (member.startLine === undefined || member.endLine === undefined) {
    return [];
  }

  return [`source.read ${member.path}:${member.startLine}-${member.endLine}`];
}

function indexedMemberName(reference: MixinMemberReference): string {
  return reference.memberKind === "constructor"
    ? simpleNameOf(reference.owner)
    : reference.memberName;
}

function normalizeClassName(className: string): string {
  return className.trim().replaceAll("/", ".");
}

function packageNameOf(className: string): string {
  const index = className.lastIndexOf(".");
  return index === -1 ? "" : className.slice(0, index);
}

function simpleNameOf(className: string): string {
  const index = className.lastIndexOf(".");
  return index === -1 ? className : className.slice(index + 1);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
