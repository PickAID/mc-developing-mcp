import { describe, expect, it } from "vitest";

import { createJdtlsRestartPolicy } from "./restart-policy.js";

describe("createJdtlsRestartPolicy", () => {
  it("allows bounded exponential restart delays", () => {
    const policy = createJdtlsRestartPolicy({
      maxRestarts: 3,
      initialDelayMs: 100,
      maxDelayMs: 250,
      multiplier: 2
    });

    expect(policy.plan(1)).toEqual({
      allowed: true,
      attempt: 1,
      delayMs: 100
    });
    expect(policy.plan(2)).toEqual({
      allowed: true,
      attempt: 2,
      delayMs: 200
    });
    expect(policy.plan(3)).toEqual({
      allowed: true,
      attempt: 3,
      delayMs: 250
    });
    expect(policy.plan(4)).toEqual({
      allowed: false,
      attempt: 4,
      delayMs: 0
    });
  });
});
