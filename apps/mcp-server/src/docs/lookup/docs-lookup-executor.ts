import {
  searchMdmDocsSqliteRecords,
  searchSelectedDocsPackages,
  rankDocsSearchHits,
  type DocsSearchHit,
  type DocsPackageRecord
} from "@mcpskill/docs-retrieval";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";

export function executeMcpServerDocsLookup(
  input: McpServerEvidenceExecutorInput,
  options: McpServerDocsLookupOptions = {}
): McpServerEvidenceExecutorResult {
  const queryText = input.candidate.queryHint ?? input.requestPlan.requestText ?? "";
  const docsSelection =
    input.docsSelection ??
    {
      selections: [],
      trace: {
        registryPackageIds: [],
        taskIntentId: input.requestPlan.trace.taskIntent.id,
        routeStep: input.candidate.routeStep,
        rejectedPackages: []
      }
    };
  const resourceRecords = options.resourceRecords ?? [];
  const sqliteArtifacts = options.sqliteArtifacts ?? [];
  const selectedPackageIds = docsSelection.selections.map(
    (selection) => selection.packageId
  );

  if (
    selectedPackageIds.length === 0 &&
    resourceRecords.length === 0 &&
    sqliteArtifacts.length === 0
  ) {
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

  const hitLimit = 5;
  const sqliteHits = searchSqliteArtifacts(sqliteArtifacts, queryText, hitLimit);
  const result = searchSelectedDocsPackages({
    queryText,
    docsSelection,
    resourceRecords,
    limit: hitLimit
  });
  const rankedHits = rankDocsSearchHits([...sqliteHits, ...result.hits]);
  const hits = rankedHits.slice(0, hitLimit);
  const trace = {
    ...result.trace,
    matchedEntryIds: hits.map((hit) => hit.entryId),
    rankedEntryIds: rankedHits.map((hit) => hit.entryId),
    truncatedEntryIds: rankedHits.slice(hitLimit).map((hit) => hit.entryId),
    hitRanking: rankedHits.map((hit) => ({
      entryId: hit.entryId,
      packageId: hit.packageId,
      source: hit.source,
      score: hit.score
    })),
    sqliteArtifactPackageIds: sqliteArtifacts.map((artifact) => artifact.packageId),
    sqliteCandidateEntryIds: sqliteHits.map((hit) => hit.entryId),
    sqliteMatchedEntryIds: hits
      .filter((hit) => hit.source === "sqlite")
      .map((hit) => hit.entryId),
    recordMatchedEntryIds: hits
      .filter((hit) => hit.source !== "sqlite")
      .map((hit) => hit.entryId)
  };

  if (hits.length === 0) {
    return {
      matched: false,
      summary: "Selected docs packages but found no structured docs hits.",
      payload: {
        source: "docs_lookup",
        queryText,
        selectedPackageIds,
        hits: [],
        trace
      }
    };
  }

  return {
    matched: true,
    summary: `Resolved docs lookup with ${hits.length} structured docs hits.`,
    payload: {
      source: "docs_lookup",
      queryText,
      selectedPackageIds,
      hits,
      trace
    }
  };
}

export interface McpServerDocsLookupOptions {
  resourceRecords?: DocsPackageRecord[];
  sqliteArtifacts?: MdmDocsSqliteArtifact[];
}

export interface MdmDocsSqliteArtifact {
  packageId: string;
  artifactPath: string;
}

function searchSqliteArtifacts(
  artifacts: MdmDocsSqliteArtifact[],
  queryText: string,
  limit: number
): DocsSearchHit[] {
  const hits: DocsSearchHit[] = [];

  for (const artifact of artifacts) {
    if (limit <= 0) {
      break;
    }
    hits.push(
      ...searchMdmDocsSqliteRecords(artifact.artifactPath, queryText, limit)
    );
  }

  return hits;
}
