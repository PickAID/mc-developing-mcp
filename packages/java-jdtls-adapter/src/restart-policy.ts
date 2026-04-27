export interface JdtlsRestartPolicyOptions {
  maxRestarts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
}

export interface JdtlsRestartPlan {
  allowed: boolean;
  attempt: number;
  delayMs: number;
}

export interface JdtlsRestartPolicy {
  plan(attempt: number): JdtlsRestartPlan;
}

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5_000;
const DEFAULT_MULTIPLIER = 2;

export function createJdtlsRestartPolicy(
  options: JdtlsRestartPolicyOptions = {}
): JdtlsRestartPolicy {
  const maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const multiplier = options.multiplier ?? DEFAULT_MULTIPLIER;

  return {
    plan(attempt) {
      if (attempt > maxRestarts) {
        return { allowed: false, attempt, delayMs: 0 };
      }

      const exponentialDelay =
        initialDelayMs * Math.max(1, multiplier) ** Math.max(0, attempt - 1);

      return {
        allowed: true,
        attempt,
        delayMs: Math.min(maxDelayMs, exponentialDelay)
      };
    }
  };
}
