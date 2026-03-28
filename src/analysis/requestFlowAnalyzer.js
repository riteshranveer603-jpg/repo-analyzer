function findFiles(context, regex) {
  return context.files.filter((file) => file.content && regex.test(file.content));
}

function buildExpressFlows(context) {
  const routeFiles = findFiles(context, /\brouter\.(get|post|put|delete)|\bapp\.(get|post|put|delete)|express\.Router/);

  return routeFiles.map((file) => {
    const controllerCandidates = context.files
      .filter((candidate) => candidate.path.includes("controller") || candidate.path.includes("service") || candidate.path.includes("db"))
      .slice(0, 4)
      .map((candidate) => candidate.path);

    return {
      framework: "Express",
      routeFile: file.path,
      summary: `Routes are registered in ${file.path} and likely delegate into controller or service modules.`,
      chain: [file.path, ...controllerCandidates],
      confidence: controllerCandidates.length > 0 ? "medium" : "low"
    };
  });
}

function buildPythonFlows(context, framework) {
  const routeFiles = findFiles(context, framework === "FastAPI" ? /@(app|router)\.(get|post|put|delete)/ : /@app\.route|Blueprint\(/);

  return routeFiles.map((file) => ({
    framework,
    routeFile: file.path,
    summary: `Request handlers appear in ${file.path}; downstream service/database calls are inferred from neighboring modules.`,
    chain: [
      file.path,
      ...context.files
        .filter((candidate) => /(service|db|database|repository|model)/i.test(candidate.path))
        .slice(0, 3)
        .map((candidate) => candidate.path)
    ],
    confidence: "medium"
  }));
}

export function analyzeRequestFlows(context, techStack, dependencyGraph) {
  const flows = [];

  if (techStack.frameworks.includes("Express")) {
    flows.push(...buildExpressFlows(context));
  }
  if (techStack.frameworks.includes("FastAPI")) {
    flows.push(...buildPythonFlows(context, "FastAPI"));
  }
  if (techStack.frameworks.includes("Flask")) {
    flows.push(...buildPythonFlows(context, "Flask"));
  }

  if (flows.length === 0) {
    const topEdges = dependencyGraph.edges.slice(0, 5).map((edge) => `${edge.from} -> ${edge.to}`);
    flows.push({
      framework: techStack.frameworks[0] || "Unknown",
      routeFile: null,
      summary: "No framework-specific request flow was detected; returning a best-effort module flow.",
      chain: topEdges,
      confidence: "low"
    });
  }

  return flows;
}
