export type SourceAcquisitionJobStatus =
  | "needs_confirmation"
  | "installing"
  | "ready"
  | "failed";

export type SourceAcquisitionJobEvent =
  | "confirm"
  | "jar_ready"
  | "mappings_ready"
  | "remapped_ready"
  | "decompiled_ready"
  | "indexed"
  | "fail";

export type SourceAcquisitionArtifact = "client" | "server" | "merged";

export interface CreateSourceAcquisitionJobStateInput {
  packageId: string;
  minecraftVersion: string;
  artifact: SourceAcquisitionArtifact;
}

export interface SourceAcquisitionJobState
  extends CreateSourceAcquisitionJobStateInput {
  status: SourceAcquisitionJobStatus;
  hasJar: boolean;
  hasMappings: boolean;
  hasRemappedJar: boolean;
  hasDecompiledSource: boolean;
  hasSourceIndex: boolean;
  lockKey: string;
}

export function createSourceAcquisitionJobState(
  input: CreateSourceAcquisitionJobStateInput
): SourceAcquisitionJobState {
  return {
    ...input,
    status: "needs_confirmation",
    hasJar: false,
    hasMappings: false,
    hasRemappedJar: false,
    hasDecompiledSource: false,
    hasSourceIndex: false,
    lockKey: `${input.packageId}:${input.artifact}`
  };
}

export function transitionSourceAcquisitionJobState(
  state: SourceAcquisitionJobState,
  event: SourceAcquisitionJobEvent
): SourceAcquisitionJobState {
  if (state.status === "failed" || state.status === "ready") {
    return state;
  }

  if (event === "fail") {
    return { ...state, status: "failed" };
  }

  const next = applyEvidenceEvent(state, event);

  if (isReady(next)) {
    return { ...next, status: "ready" };
  }

  return next;
}

function applyEvidenceEvent(
  state: SourceAcquisitionJobState,
  event: SourceAcquisitionJobEvent
): SourceAcquisitionJobState {
  switch (event) {
    case "confirm":
      return state.status === "needs_confirmation"
        ? { ...state, status: "installing" }
        : state;
    case "jar_ready":
      return { ...state, hasJar: true, status: activeStatus(state) };
    case "mappings_ready":
      return { ...state, hasMappings: true, status: activeStatus(state) };
    case "remapped_ready":
      return { ...state, hasRemappedJar: true, status: activeStatus(state) };
    case "decompiled_ready":
      return { ...state, hasDecompiledSource: true, status: activeStatus(state) };
    case "indexed":
      return { ...state, hasSourceIndex: true, status: activeStatus(state) };
    case "fail":
      return state;
  }
}

function activeStatus(
  state: SourceAcquisitionJobState
): SourceAcquisitionJobStatus {
  return state.status === "needs_confirmation" ? "needs_confirmation" : "installing";
}

function isReady(state: SourceAcquisitionJobState): boolean {
  return (
    state.status === "installing" &&
    state.hasJar &&
    state.hasMappings &&
    state.hasRemappedJar &&
    state.hasDecompiledSource &&
    state.hasSourceIndex
  );
}
