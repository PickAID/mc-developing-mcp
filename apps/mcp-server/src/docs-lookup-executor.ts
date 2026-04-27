import { searchSelectedDocsPackages } from "@mcpskill/docs-retrieval";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export function executeMcpServerDocsLookup(
  input: McpServerEvidenceExecutorInput
): McpServerEvidenceExecutorResult {
  const queryText = input.candidate.queryHint ?? input.requestPlan.requestText ?? "";
  const docsSelection = input.docsSelection;

  if (!docsSelection) {
    return {
      matched: false,
      summary: "No docs packages were selected for docs lookup.",
      payload: {
        source: "docs_lookup",
        queryText,
        selectedPackageIds: [],
        hits: []
      }
    };
  }

  const selectedPackageIds = docsSelection.selections.map(
    (selection) => selection.packageId
  );

  if (selectedPackageIds.length === 0) {
    return {
      matched: false,
      summary: "No docs packages were selected for docs lookup.",
      payload: {
        source: "docs_lookup",
        queryText,
        selectedPackageIds: [],
        hits: []
      }
    };
  }

  const result = searchSelectedDocsPackages({
    queryText,
    docsSelection
  });

  if (result.hits.length === 0) {
    return {
      matched: false,
      summary: "Selected docs packages but found no structured docs hits.",
      payload: {
        source: "docs_lookup",
        queryText,
        selectedPackageIds,
        hits: [],
        trace: result.trace
      }
    };
  }

  return {
    matched: true,
    summary: `Resolved docs lookup with ${result.hits.length} structured docs hits.`,
    payload: {
      source: "docs_lookup",
      queryText,
      selectedPackageIds,
      hits: result.hits,
      trace: result.trace
    }
  };
}
