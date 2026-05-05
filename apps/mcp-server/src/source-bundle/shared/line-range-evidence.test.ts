import { describe, expect, it } from "vitest";

import { createLineRangeEvidence } from "./line-range-evidence.js";

describe("createLineRangeEvidence", () => {
  it("caps explicit follow-up ranges when maxLines is provided", () => {
    const content = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join(
      "\n"
    );

    expect(
      createLineRangeEvidence(content, {
        startLine: 10,
        endLine: 100,
        maxLines: 5
      })
    ).toMatchObject({
      content: ["line 10", "line 11", "line 12", "line 13", "line 14"].join(
        "\n"
      ),
      startLine: 10,
      endLine: 14,
      totalLines: 100,
      truncated: true
    });
  });
});
