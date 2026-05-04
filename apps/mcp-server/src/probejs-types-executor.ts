import { opendir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  classifyKubeJsScriptScope,
  createKubeJsLanguageServiceCache,
  createKubeJsLanguageServiceProject,
  discoverProbeJsLanguageProject,
  getKubeJsCompletions,
  getKubeJsDiagnostics,
  getKubeJsQuickInfo,
  inferKubeJSScriptScope,
  type KubeJsLanguageServiceCache,
  type KubeJsLanguageServiceProject,
  type KubeJsScriptScope
} from "@mcpskill/kubejs-language-service";
import {
  type KubeJsSemanticResourceEntry,
  type KubeJsSemanticResourceKind,
  type KubeJsTypeSemanticSummary,
  type KubeJsUnknownResource
} from "@mcpskill/kubejs-types-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import {
  createProbeResourceSummaryCache,
  summarizeProbeResourcesWithCache,
  type ProbeResourceSummaryCache
} from "./probejs-resource-summary-cache.js";
import { buildKubeJsLifecycleEvidence } from "./kubejs-lifecycle-evidence.js";

export interface McpServerProbeJsTypesExecutorOptions {
  languageProjectCache?: KubeJsLanguageServiceCache<KubeJsLanguageServiceProject>;
  probeResourceSummaryCache?: ProbeResourceSummaryCache;
}

const defaultProbeJsTypesExecutor = createMcpServerProbeJsTypesExecutor();

export function createMcpServerProbeJsTypesExecutor(
  options: McpServerProbeJsTypesExecutorOptions = {}
) {
  const languageProjectCache =
    options.languageProjectCache ??
    createKubeJsLanguageServiceCache<KubeJsLanguageServiceProject>({
      maxEntries: 1
    });
  const probeResourceSummaryCache =
    options.probeResourceSummaryCache ??
    createProbeResourceSummaryCache({ maxEntries: 2 });

  return (input: McpServerEvidenceExecutorInput) =>
    executeMcpServerProbeJsTypesWithCache(
      input,
      languageProjectCache,
      probeResourceSummaryCache
    );
}

export async function executeMcpServerProbeJsTypes(
  input: McpServerEvidenceExecutorInput
): Promise<McpServerEvidenceExecutorResult> {
  return defaultProbeJsTypesExecutor(input);
}

async function executeMcpServerProbeJsTypesWithCache(
  input: McpServerEvidenceExecutorInput,
  languageProjectCache: KubeJsLanguageServiceCache<KubeJsLanguageServiceProject>,
  probeResourceSummaryCache: ProbeResourceSummaryCache
): Promise<McpServerEvidenceExecutorResult> {
  if (input.candidate.routeStep !== "probejs_types") {
    return {
      matched: false,
      summary: `ProbeJS executor does not handle ${input.candidate.routeStep}.`
    };
  }

  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.workspaceRoot;
  if (!workspaceRoot) {
    return {
      matched: false,
      summary: "No workspace root available for ProbeJS semantic query."
    };
  }

  const symbol = extractRequestedSymbol(input.requestPlan.requestText);
  if (!symbol) {
    return {
      matched: false,
      summary: "No KubeJS symbol was found in the request text."
    };
  }

  const scriptFiles = await collectKubeJsScripts(workspaceRoot);
  const scriptFile = findBestKubeJsScriptFile(
    workspaceRoot,
    scriptFiles,
    input.requestPlan.requestText
  );
  if (!scriptFile) {
    return {
      matched: false,
      summary: "No KubeJS script file was available for semantic analysis."
    };
  }

  const scope = classifyKubeJsScriptScope(scriptFile, workspaceRoot);
  const probeProject = await discoverProbeJsLanguageProject({
    workspaceRoot,
    scope
  });

  if (probeProject.declarationFiles.length === 0) {
    return {
      matched: false,
      summary: `No ProbeJS declarations were found for ${scope} scope.`
    };
  }

  const cacheKey = await buildLanguageProjectCacheKey(
    workspaceRoot,
    scriptFile,
    scope,
    probeProject.declarationFiles
  );
  const queryFile = join(workspaceRoot, ".mcpskill", `probe-query-${scope}.js`);
  const queryContent = `${symbol};\n`;
  let cacheHit = true;
  const project = languageProjectCache.getOrCreate(cacheKey, () => {
    cacheHit = false;
    return createKubeJsLanguageServiceProject({
      workspaceRoot,
      scriptFiles: [scriptFile],
      declarationFiles: probeProject.declarationFiles.map((file) => file.absolutePath),
      virtualFiles: [
        {
          filePath: queryFile,
          content: queryContent
        }
      ]
    });
  });
  project.updateVirtualFile(queryFile, queryContent);

  const qualifier = symbol.split(".").slice(0, -1).join(".");
  const member = symbol.split(".").at(-1) ?? symbol;
  const completions = getKubeJsCompletions(project, {
    filePath: queryFile,
    search: `${qualifier}.`
  });
  const quickInfo = getKubeJsQuickInfo(project, {
    filePath: queryFile,
    search: member
  });
  const diagnostics = getKubeJsDiagnostics(project, {
    filePath: queryFile,
    maxDiagnostics: 10
  });
  const resourceQueries = extractProbeResourceQueries(
    input.requestPlan.requestText,
    symbol
  );
  const probeResourcesResult = await summarizeProbeResourcesWithCache({
    workspaceRoot,
    includeUnknownResources: resourceQueries.length === 0,
    maxFiles: 200,
    maxBytesPerFile: 65_536,
    maxEntriesPerKind: 20,
    resourceQueries,
    cache: probeResourceSummaryCache
  });
  const lifecycleEvidence = await buildKubeJsLifecycleEvidence({
    workspaceRoot,
    requestText: input.requestPlan.requestText,
    selectedScriptFile: scriptFile,
    selectedScope: scope,
    declarationFiles: probeProject.declarationFiles,
    scriptFiles
  });

  return {
    matched: true,
    summary: `Resolved ${symbol} from ProbeJS TypeScript language service.`,
    payload: {
      source: "kubejs_language_service",
      scope,
      symbol,
      scriptFile,
      declarationCount: probeProject.declarationFiles.length,
      declarationBytes: probeProject.totalDeclarationBytes,
      snippetCount: probeProject.snippetFiles.length,
      cacheHit,
      probeResourceCacheHit: probeResourcesResult.cacheHit,
      queryMode: "virtual",
      probeResources: compactProbeResources(probeResourcesResult.summary),
      ...lifecycleEvidence,
      completions: completions.entries,
      quickInfo: quickInfo.text,
      diagnostics
    }
  };
}

function findBestKubeJsScriptFile(
  workspaceRoot: string,
  files: string[],
  requestText?: string
): string | undefined {
  const inferred = inferKubeJSScriptScope({ request: requestText });
  const scope = inferred.scope === "unknown" ? "shared" : inferred.scope;

  return (
    files.find(
      (file) => classifyKubeJsScriptScope(file, workspaceRoot) === scope
    ) ?? files[0]
  );
}

async function collectKubeJsScripts(workspaceRoot: string): Promise<string[]> {
  const roots = [
    join(workspaceRoot, "kubejs"),
    join(workspaceRoot, "local", "kubejs")
  ];
  const files: string[] = [];

  for (const root of roots) {
    files.push(...(await collectScriptsIfPresent(root)));
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function collectScriptsIfPresent(root: string): Promise<string[]> {
  try {
    return await walkJavaScriptFiles(root);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function walkJavaScriptFiles(root: string): Promise<string[]> {
  const entries = await opendir(root);
  const files: string[] = [];

  for await (const entry of entries) {
    const absolutePath = resolve(join(root, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await walkJavaScriptFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function extractRequestedSymbol(requestText?: string): string | undefined {
  const match = requestText?.match(
    /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/
  );

  return match?.[0];
}

function extractProbeResourceQueries(
  requestText: string | undefined,
  symbol: string
): string[] {
  const queries = new Set<string>();
  let freeText = requestText ?? "";
  addQuery(queries, symbol);
  addQuery(queries, symbol.split(".").at(-1));

  for (const resourceId of freeText.match(/#?[a-z0-9_.-]+:[a-z0-9_./-]+/gi) ?? []) {
    addQuery(queries, resourceId);
    addQuery(queries, resourceId.replace(/^#/, ""));
    freeText = freeText.replace(resourceId, " ");
  }

  for (const dotted of freeText.match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g) ?? []) {
    addQuery(queries, dotted);
    if (/[A-Z$]/.test(dotted)) {
      addQuery(queries, dotted.split(".").at(-1));
    }
    freeText = freeText.replace(dotted, " ");
  }

  for (const word of freeText.match(/\b[A-Za-z][A-Za-z0-9_$-]{3,}\b/g) ?? []) {
    if (!isProbeResourceStopWord(word)) {
      addQuery(queries, word);
    }
  }

  return [...queries];
}

function addQuery(queries: Set<string>, value: string | undefined): void {
  const query = value?.trim().replace(/[,.]+$/g, "");
  if (query && query.length >= 3) {
    queries.add(query);
  }
}

function isProbeResourceStopWord(word: string): boolean {
  return PROBE_RESOURCE_STOP_WORDS.has(word.toLowerCase());
}

const PROBE_RESOURCE_STOP_WORDS = new Set([
  "and",
  "block",
  "class",
  "client",
  "fabric",
  "fluid",
  "forge",
  "item",
  "kubejs",
  "minecraft",
  "modpack",
  "neoforge",
  "registry",
  "script",
  "scripts",
  "server",
  "startup",
  "this",
  "use",
  "with"
]);

async function buildLanguageProjectCacheKey(
  workspaceRoot: string,
  scriptFile: string,
  scope: KubeJsScriptScope,
  declarationFiles: Array<{
    absolutePath: string;
    relativePath: string;
    sizeBytes: number;
    mtimeMs: number;
  }>
): Promise<string> {
  const normalizedRoot = resolve(workspaceRoot);
  const scriptStat = await stat(scriptFile);
  const files = [
    fingerprintFile(
      "script",
      relative(normalizedRoot, scriptFile).replaceAll("\\", "/"),
      scriptStat.size,
      scriptStat.mtimeMs
    ),
    ...declarationFiles.map((file) =>
      fingerprintFile("dts", file.relativePath, file.sizeBytes, file.mtimeMs)
    )
  ];

  return JSON.stringify({
    workspaceRoot: normalizedRoot,
    scope,
    files
  });
}

function fingerprintFile(
  kind: "script" | "dts",
  path: string,
  sizeBytes: number,
  mtimeMs: number
): string {
  return [kind, path, sizeBytes, Math.floor(mtimeMs)].join(":");
}

function compactProbeResources(summary: KubeJsTypeSemanticSummary) {
  return {
    summary: summary.summary,
    entries: compactEntryGroups(summary.entries),
    unknownResources: compactUnknownResources(summary.unknownResources)
  };
}

function compactEntryGroups(
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>
) {
  return Object.fromEntries(
    Object.entries(entries).map(([kind, values]) => [kind, compactEntries(values)])
  );
}

function compactEntries(entries: KubeJsSemanticResourceEntry[]) {
  return entries.map((entry) => ({
    sourceKind: entry.sourceKind satisfies KubeJsSemanticResourceKind,
    extractorId: entry.extractorId,
    sourceFormat: entry.sourceFormat,
    confidence: entry.confidence,
    name: entry.name,
    value: entry.value,
    file: entry.file.relativePath,
    lineNumber: entry.lineNumber,
    warnings: entry.warnings,
    metadata: entry.metadata
  }));
}

function compactUnknownResources(resources: KubeJsUnknownResource[]) {
  return resources.map((resource) => ({
    extractorId: resource.extractorId,
    sourceFormat: resource.sourceFormat,
    confidence: resource.confidence,
    reason: resource.reason,
    file: resource.file.relativePath,
    preview: resource.preview
  }));
}
