import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import { inspectSourcePackageInstallLock } from "./install-lock.js";
import { resolveSourcePackagePaths } from "./layout.js";

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

export type SourceAcquisitionJobStage =
  | "waiting_for_confirmation"
  | "download_artifact"
  | "resolve_mappings"
  | "remap_jar"
  | "decompile_source"
  | "build_source_index"
  | "complete"
  | "failed";

export type SourceAcquisitionJobExecutionStatus =
  | "synchronous_install"
  | "background_ready"
  | "background_unavailable"
  | "queued";

export interface SourceAcquisitionJobExecutionEvidence {
  status: SourceAcquisitionJobExecutionStatus;
  runner: string;
  summary: string;
  queuedAt?: string;
  jobId?: string;
  reason?: string;
}

export interface SourceAcquisitionJobProgressSnapshot {
  completedStages: number;
  totalStages: number;
  percent: number;
  currentStage: SourceAcquisitionJobStage;
}

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
  createdAt: string;
  updatedAt: string;
  heartbeatAt?: string;
  progress: SourceAcquisitionJobProgressSnapshot;
  statusReason?: string;
  activeLockPath?: string;
  lockOwner?: string;
  lockAcquiredAt?: string;
  lockAgeMs?: number;
  lockStale?: boolean;
  execution?: SourceAcquisitionJobExecutionEvidence;
}

export interface SourceAcquisitionJobSupervisionSnapshot {
  state?: SourceAcquisitionJobState;
  lock?: {
    path: string;
    exists: boolean;
    owner?: string;
    acquiredAt?: string;
    ageMs?: number;
    stale: boolean;
    staleReason?: string;
  };
}

export function createSourceAcquisitionJobState(
  input: CreateSourceAcquisitionJobStateInput
): SourceAcquisitionJobState {
  const now = new Date().toISOString();
  return withProgress({
    ...input,
    status: "needs_confirmation",
    hasJar: false,
    hasMappings: false,
    hasRemappedJar: false,
    hasDecompiledSource: false,
    hasSourceIndex: false,
    lockKey: `${input.packageId}:${input.artifact}`,
    createdAt: now,
    updatedAt: now
  });
}

export async function readSourceAcquisitionJobState(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<SourceAcquisitionJobState | undefined> {
  try {
    const raw = await readFile(
      resolveSourcePackagePaths(runtimeLayout, sourcePackage).sourceJobStatePath,
      "utf-8"
    );

    return JSON.parse(raw) as SourceAcquisitionJobState;
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeSourceAcquisitionJobState(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate,
  state: SourceAcquisitionJobState
): Promise<void> {
  const sourceJobStatePath = resolveSourcePackagePaths(
    runtimeLayout,
    sourcePackage
  ).sourceJobStatePath;

  await mkdir(dirname(sourceJobStatePath), { recursive: true });
  await writeFile(sourceJobStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function inspectSourceAcquisitionJobSupervision(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<SourceAcquisitionJobSupervisionSnapshot> {
  const state = await readSourceAcquisitionJobState(runtimeLayout, sourcePackage);
  const lockPath =
    state?.activeLockPath ??
    resolveSourcePackagePaths(runtimeLayout, sourcePackage).installLockDir;
  const lockInspection = await inspectSourcePackageInstallLock(lockPath);

  return {
    ...(state ? { state } : {}),
    lock: {
      path: lockPath,
      exists: lockInspection.exists,
      owner: lockInspection.owner,
      acquiredAt: lockInspection.acquiredAt,
      ageMs: lockInspection.ageMs,
      stale: lockInspection.stale,
      staleReason: lockInspection.staleReason
    }
  };
}

export function heartbeatSourceAcquisitionJobState(
  state: SourceAcquisitionJobState
): SourceAcquisitionJobState {
  if (state.status !== "installing") {
    return withProgress(state);
  }

  const now = new Date().toISOString();
  return withProgress({
    ...state,
    heartbeatAt: now,
    updatedAt: now
  });
}

export function transitionSourceAcquisitionJobState(
  state: SourceAcquisitionJobState,
  event: SourceAcquisitionJobEvent
): SourceAcquisitionJobState {
  if (state.status === "failed" || state.status === "ready") {
    return withProgress(state);
  }

  if (event === "fail") {
    return withProgress({ ...state, status: "failed", updatedAt: nowIso() });
  }

  const next = applyEvidenceEvent(state, event);

  if (isReady(next)) {
    return withProgress({ ...next, status: "ready", updatedAt: nowIso() });
  }

  return withProgress({ ...next, updatedAt: nowIso() });
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

function withProgress(
  state: Omit<SourceAcquisitionJobState, "progress"> & {
    progress?: SourceAcquisitionJobProgressSnapshot;
  }
): SourceAcquisitionJobState {
  return {
    ...state,
    progress: buildProgressSnapshot(state)
  };
}

function buildProgressSnapshot(
  state: Pick<
    SourceAcquisitionJobState,
    | "status"
    | "hasJar"
    | "hasMappings"
    | "hasRemappedJar"
    | "hasDecompiledSource"
    | "hasSourceIndex"
  >
): SourceAcquisitionJobProgressSnapshot {
  const completedStages = [
    state.hasJar,
    state.hasMappings,
    state.hasRemappedJar,
    state.hasDecompiledSource,
    state.hasSourceIndex
  ].filter(Boolean).length;

  return {
    completedStages,
    totalStages: 5,
    percent: Math.round((completedStages / 5) * 100),
    currentStage: currentStage(state)
  };
}

function currentStage(
  state: Pick<
    SourceAcquisitionJobState,
    | "status"
    | "hasJar"
    | "hasMappings"
    | "hasRemappedJar"
    | "hasDecompiledSource"
    | "hasSourceIndex"
  >
): SourceAcquisitionJobStage {
  if (state.status === "needs_confirmation") {
    return "waiting_for_confirmation";
  }
  if (state.status === "failed") {
    return "failed";
  }
  if (state.status === "ready") {
    return "complete";
  }
  if (!state.hasJar) {
    return "download_artifact";
  }
  if (!state.hasMappings) {
    return "resolve_mappings";
  }
  if (!state.hasRemappedJar) {
    return "remap_jar";
  }
  if (!state.hasDecompiledSource) {
    return "decompile_source";
  }
  return state.hasSourceIndex ? "complete" : "build_source_index";
}

function nowIso(): string {
  return new Date().toISOString();
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
