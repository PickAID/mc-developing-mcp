export type MixinTargetVerificationStatus =
  | "valid"
  | "missing_target"
  | "ambiguous_target"
  | "source_unavailable";

export interface VerifyMixinTargetInput {
  requestedTarget: string;
  availableClasses: string[];
}

export interface MixinTargetVerificationResult {
  status: MixinTargetVerificationStatus;
  requestedTarget: string;
  candidates: string[];
  nextReads: string[];
}

export function verifyMixinTarget(
  input: VerifyMixinTargetInput
): MixinTargetVerificationResult {
  const requestedTarget = normalizeClassName(input.requestedTarget);
  const availableClasses = unique(
    input.availableClasses.map(normalizeClassName).filter(Boolean)
  );

  if (availableClasses.length === 0) {
    return buildResult("source_unavailable", requestedTarget, []);
  }

  const exactMatch = availableClasses.find(
    (className) => className === requestedTarget
  );
  if (exactMatch) {
    return buildResult("valid", requestedTarget, [exactMatch]);
  }

  const candidates = selectCloseCandidates(requestedTarget, availableClasses);
  if (candidates.length > 1) {
    return buildResult("ambiguous_target", requestedTarget, candidates);
  }

  return buildResult("missing_target", requestedTarget, candidates);
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
  candidates: string[]
): MixinTargetVerificationResult {
  return {
    status,
    requestedTarget,
    candidates,
    nextReads: []
  };
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
