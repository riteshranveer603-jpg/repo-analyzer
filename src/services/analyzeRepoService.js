import { assembleReport } from "../analysis/reportAssembler.js";
import { analyzeRequestFlows } from "../analysis/requestFlowAnalyzer.js";
import { detectEntryPoints, deriveExecutionFlows } from "../analysis/entryPointAnalyzer.js";
import { detectTechStack } from "../analysis/frameworkDetectors.js";
import { summarizeFolders } from "../analysis/folderSummarizer.js";
import { buildDependencyGraph } from "../analysis/graphBuilder.js";
import { collectRepoContext, withClonedRepo } from "../analysis/repoIntake.js";

function emitProgress(onProgress, stage, detail) {
  if (typeof onProgress === "function") {
    onProgress({ stage, detail, updatedAt: new Date().toISOString() });
  }
}

export async function analyzeRepoFromUrl(repoUrl, options = {}) {
  const { onProgress } = options;

  emitProgress(onProgress, "cloning", "Cloning repository");
  return withClonedRepo(repoUrl, async (workspace) => {
    emitProgress(onProgress, "indexing", "Indexing files and manifests");
    const context = await collectRepoContext(workspace);

    emitProgress(onProgress, "detecting-stack", "Detecting languages and frameworks");
    const techStack = detectTechStack(context);

    emitProgress(onProgress, "building-graph", "Building dependency graph");
    const dependencyGraph = await buildDependencyGraph(context);

    emitProgress(onProgress, "finding-entry-points", "Detecting entry points and execution flow");
    const entryPoints = detectEntryPoints(context, techStack);
    const executionFlows = deriveExecutionFlows(context, entryPoints, dependencyGraph, techStack);

    emitProgress(onProgress, "summarizing", "Summarizing folders and request flow");
    const folderSummary = summarizeFolders(context, techStack);
    const requestFlows = analyzeRequestFlows(context, techStack, dependencyGraph);

    emitProgress(onProgress, "assembling-report", "Assembling final report");
    return assembleReport({
      repoUrl,
      context,
      techStack,
      dependencyGraph,
      entryPoints,
      executionFlows,
      folderSummary,
      requestFlows
    });
  });
}
