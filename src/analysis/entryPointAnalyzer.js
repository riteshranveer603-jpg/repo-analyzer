function parsePackageScripts(packageJson) {
  if (!packageJson?.scripts) {
    return [];
  }

  return Object.entries(packageJson.scripts).map(([name, command]) => ({ name, command }));
}

function detectPythonEntryPoints(context) {
  const candidates = [];

  for (const file of context.files) {
    if (!file.content || file.extension !== ".py") {
      continue;
    }

    if (/FastAPI\(/.test(file.content) || /Flask\(/.test(file.content) || /if __name__ == ["']__main__["']/.test(file.content)) {
      candidates.push({
        path: file.path,
        reason: "Python app bootstrap or executable module"
      });
    }
  }

  return candidates;
}

export function detectEntryPoints(context, techStack) {
  const entryPoints = [];
  const scripts = parsePackageScripts(techStack.packageJson);

  for (const script of scripts) {
    const match = script.command.match(/(?:node|tsx|ts-node|next|nest)\s+([A-Za-z0-9_./-]+)/);
    if (match) {
      entryPoints.push({
        path: match[1].replace(/^\.\//, ""),
        reason: `Referenced by package.json script "${script.name}"`
      });
    }
  }

  for (const file of context.files) {
    if (["src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "app.py", "main.py", "server.js", "server.ts"].includes(file.path)) {
      entryPoints.push({
        path: file.path,
        reason: "Conventional application entry point"
      });
    }
  }

  entryPoints.push(...detectPythonEntryPoints(context));

  return Array.from(new Map(entryPoints.map((item) => [item.path, item])).values());
}

export function deriveExecutionFlows(context, entryPoints, dependencyGraph, techStack) {
  return entryPoints.map((entryPoint) => {
    const firstHop = dependencyGraph.edges.filter((edge) => edge.from === entryPoint.path).slice(0, 5);
    return {
      start: entryPoint.path,
      framework: techStack.frameworks[0] || "Unknown",
      summary: `Application likely starts at ${entryPoint.path} and fans out into ${firstHop.length} directly referenced modules.`,
      steps: [
        { type: "entry", path: entryPoint.path, note: entryPoint.reason },
        ...firstHop.map((edge) => ({
          type: "module",
          path: edge.to,
          note: `Referenced via ${edge.type}`
        }))
      ]
    };
  });
}
