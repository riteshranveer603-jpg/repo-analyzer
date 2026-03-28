function buildWarnings(context, techStack, entryPoints, requestFlows) {
  const warnings = [];

  if (context.files.length >= 2000) {
    warnings.push("Repository file enumeration hit the v1 analysis cap; some files may be omitted.");
  }
  if (techStack.frameworks.length === 0) {
    warnings.push("No supported web framework was confidently detected. Some summaries use generic heuristics.");
  }
  if (entryPoints.length === 0) {
    warnings.push("No conventional entry point was detected.");
  }
  if (requestFlows.some((flow) => flow.confidence === "low")) {
    warnings.push("Request flow analysis is partial and based on best-effort heuristics.");
  }

  return warnings;
}

function describeArchitecture(techStack) {
  if (techStack.frameworks.length > 0) {
    return `${techStack.frameworks.join(", ")} application with ${techStack.languages.join(" + ")} source code.`;
  }
  return `${techStack.languages.join(" + ") || "Unknown-language"} repository with ${techStack.architectureHints.join(", ") || "custom"} architecture hints.`;
}

function clampScore(value) {
  return Math.max(1, Math.min(10, Math.round(value * 10) / 10));
}

function scoreRepo({ context, techStack, entryPoints, folderSummary, requestFlows, dependencyGraph, analysisWarnings }) {
  const hasFramework = techStack.frameworks.length > 0;
  const hasEntryPoints = entryPoints.length > 0;
  const hasFolderCoverage = folderSummary.length >= 3;
  const hasRequestConfidence = requestFlows.some((flow) => flow.confidence === "medium" || flow.confidence === "high");
  const hasGraph = dependencyGraph.edges.length > 0;
  const warningPenalty = Math.min(analysisWarnings.length * 0.4, 1.6);
  const configFiles = context.files.filter((file) =>
    ["package.json", "requirements.txt", "pyproject.toml", "Dockerfile", "README.md"].some((name) => file.path.endsWith(name))
  ).length;

  const codeQuality = clampScore(5.8 + (hasGraph ? 1 : 0) + (hasEntryPoints ? 0.8 : 0) + Math.min(configFiles * 0.25, 1) - warningPenalty);
  const structure = clampScore(5.5 + (hasFolderCoverage ? 1.4 : 0.5) + (hasFramework ? 0.8 : 0.2) + Math.min(folderSummary.length * 0.15, 1) - warningPenalty);
  const readability = clampScore(5.6 + (configFiles > 0 ? 0.7 : 0) + (hasEntryPoints ? 0.8 : 0.2) + (hasFolderCoverage ? 0.8 : 0.3) - warningPenalty);
  const practicalUsefulness = clampScore(5.7 + (hasFramework ? 1 : 0.3) + (hasRequestConfidence ? 1 : 0.2) + (hasGraph ? 0.8 : 0.2) - warningPenalty);
  const finalScore = clampScore((codeQuality + structure + readability + practicalUsefulness) / 4);

  return {
    code_quality: codeQuality,
    structure,
    readability,
    practical_usefulness: practicalUsefulness,
    final_score: finalScore
  };
}

export function assembleReport({
  repoUrl,
  context,
  techStack,
  dependencyGraph,
  entryPoints,
  executionFlows,
  folderSummary,
  requestFlows
}) {
  const criticalFiles = [
    ...dependencyGraph.criticalFiles,
    ...context.files
      .filter((file) =>
        ["package.json", "requirements.txt", "pyproject.toml", "Dockerfile", ".env.example"].some((name) => file.path.endsWith(name))
      )
      .map((file) => ({ path: file.path, score: 2, reason: "Manifest or configuration file" }))
  ]
    .filter((value, index, items) => items.findIndex((item) => item.path === value.path) === index)
    .slice(0, 12);

  const analysisWarnings = buildWarnings(context, techStack, entryPoints, requestFlows);
  const repoScore = scoreRepo({
    context,
    techStack,
    entryPoints,
    folderSummary,
    requestFlows,
    dependencyGraph,
    analysisWarnings
  });

  return {
    repo_url: repoUrl,
    generated_at: new Date().toISOString(),
    repo_summary: {
      tech_stack: techStack,
      architecture: describeArchitecture(techStack),
      total_files_analyzed: context.files.length,
      notable_patterns: techStack.architectureHints
    },
    folder_summary: folderSummary,
    entry_points: entryPoints,
    execution_flows: executionFlows,
    dependency_graph: dependencyGraph,
    critical_files: criticalFiles,
    request_flows: requestFlows,
    repo_score: repoScore,
    analysis_warnings: analysisWarnings
  };
}
