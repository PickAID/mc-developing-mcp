import type {
  CurrentRuntime,
  Loader,
  RuntimeCandidate,
  RuntimeConfidence,
  RuntimeEvidence
} from "@mcpskill/shared-types";

export interface CollectedRuntimeFact {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
  weight: RuntimeConfidence;
  sourcePath: string;
  kind: string;
  detail: string;
  value: string;
}

interface CandidateBucketKey {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
}

export function resolveCurrentRuntime(
  facts: CollectedRuntimeFact[]
): CurrentRuntime {
  const candidates = rankCandidates(facts);
  if (candidates.length === 0) {
    return {
      source: "unknown",
      confidence: "unknown",
      evidenceSources: [],
      candidates: [],
      evidence: []
    };
  }

  const evidence = toEvidence(facts);
  if (hasStrongConflict(candidates)) {
    return {
      source: "unknown",
      confidence: "unknown",
      evidenceSources: [],
      candidates,
      evidence
    };
  }

  const topCandidate = candidates[0];
  return {
    minecraftVersion: topCandidate.minecraftVersion,
    loader: topCandidate.loader,
    loaderVersion: topCandidate.loaderVersion,
    source: "workspace-detect",
    confidence: topCandidate.confidence,
    evidenceSources: [...topCandidate.evidenceSources],
    candidates,
    evidence
  };
}

export function dedupeFacts(
  facts: CollectedRuntimeFact[]
): CollectedRuntimeFact[] {
  const seen = new Set<string>();
  const uniqueFacts: CollectedRuntimeFact[] = [];

  for (const fact of facts) {
    const key = [
      fact.sourcePath,
      fact.kind,
      fact.value,
      fact.minecraftVersion,
      fact.loader,
      fact.loaderVersion,
      fact.weight
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueFacts.push(fact);
  }

  return uniqueFacts;
}

function rankCandidates(facts: CollectedRuntimeFact[]): RuntimeCandidate[] {
  const buckets = new Map<string, { key: CandidateBucketKey; facts: CollectedRuntimeFact[] }>();

  for (const fact of facts) {
    const key = serializeBucketKey(fact);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.facts.push(fact);
      continue;
    }
    buckets.set(key, {
      key: {
        minecraftVersion: fact.minecraftVersion,
        loader: fact.loader,
        loaderVersion: fact.loaderVersion
      },
      facts: [fact]
    });
  }

  const candidates = [...buckets.values()].map(({ key, facts: bucketFacts }) => ({
    minecraftVersion: key.minecraftVersion,
    loader: key.loader,
    loaderVersion: key.loaderVersion,
    confidence: confidenceForBucket(bucketFacts),
    evidenceSources: collectEvidenceSources(bucketFacts)
  }));

  candidates.sort((left, right) => {
    const leftScore = scoreForConfidence(left.confidence);
    const rightScore = scoreForConfidence(right.confidence);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftCompleteness = scoreCompleteness(left);
    const rightCompleteness = scoreCompleteness(right);
    if (leftCompleteness !== rightCompleteness) {
      return rightCompleteness - leftCompleteness;
    }

    if (left.evidenceSources.length !== right.evidenceSources.length) {
      return right.evidenceSources.length - left.evidenceSources.length;
    }

    const leftVersion = left.minecraftVersion ?? "";
    const rightVersion = right.minecraftVersion ?? "";
    if (leftVersion !== rightVersion) {
      return rightVersion.localeCompare(leftVersion);
    }

    return (left.loader ?? "").localeCompare(right.loader ?? "");
  });

  return candidates;
}

function confidenceForBucket(
  bucketFacts: CollectedRuntimeFact[]
): RuntimeConfidence {
  const maxScore = bucketFacts.reduce(
    (current, fact) => Math.max(current, scoreForConfidence(fact.weight)),
    0
  );
  return confidenceFromScore(maxScore);
}

function hasStrongConflict(candidates: RuntimeCandidate[]): boolean {
  if (candidates.length < 2) {
    return false;
  }

  const topCandidate = candidates[0];
  if (topCandidate.confidence !== "high") {
    return false;
  }

  return candidates.slice(1).some((candidate) => {
    if (candidate.confidence !== "high") {
      return false;
    }

    return (
      fieldsConflict(topCandidate.minecraftVersion, candidate.minecraftVersion) ||
      fieldsConflict(topCandidate.loader, candidate.loader) ||
      loaderVersionsConflict(
        topCandidate.loaderVersion,
        candidate.loaderVersion,
        topCandidate.loader,
        candidate.loader
      )
    );
  });
}

function fieldsConflict(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left !== right);
}

function loaderVersionsConflict(
  left: string | undefined,
  right: string | undefined,
  leftLoader: Loader | undefined,
  rightLoader: Loader | undefined
): boolean {
  if (!left || !right || leftLoader !== rightLoader || left === right) {
    return false;
  }

  const leftMajor = extractLoaderVersionMajor(left);
  const rightMajor = extractLoaderVersionMajor(right);
  if (leftMajor !== rightMajor) {
    return true;
  }

  if (!left.includes(".") || !right.includes(".")) {
    return false;
  }

  return true;
}

function toEvidence(facts: CollectedRuntimeFact[]): RuntimeEvidence[] {
  return facts.map((fact) => ({
    kind: fact.kind,
    path: fact.sourcePath,
    detail: fact.detail,
    value: fact.value,
    weight: fact.weight,
    structured: fact.weight !== "low"
  }));
}

function collectEvidenceSources(facts: CollectedRuntimeFact[]): string[] {
  const sources = new Set<string>();

  for (const fact of facts) {
    if (fact.sourcePath) {
      sources.add(fact.sourcePath);
    }
  }

  return [...sources];
}

function scoreCompleteness(candidate: RuntimeCandidate): number {
  let score = 0;
  if (candidate.minecraftVersion) {
    score += 1;
  }
  if (candidate.loader) {
    score += 1;
  }
  if (candidate.loaderVersion) {
    score += 1;
  }
  return score;
}

function scoreForConfidence(confidence: RuntimeConfidence): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function confidenceFromScore(score: number): RuntimeConfidence {
  switch (score) {
    case 3:
      return "high";
    case 2:
      return "medium";
    case 1:
      return "low";
    default:
      return "unknown";
  }
}

function serializeBucketKey(fact: CollectedRuntimeFact): string {
  return [
    fact.minecraftVersion ?? "",
    fact.loader ?? "",
    fact.loaderVersion ?? ""
  ].join("|");
}

function extractLoaderVersionMajor(loaderVersion: string): string {
  return loaderVersion.split(".")[0] ?? loaderVersion;
}
