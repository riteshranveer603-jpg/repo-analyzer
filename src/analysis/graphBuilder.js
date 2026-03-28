import path from "path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function resolveImportPath(sourcePath, importPath, allPaths) {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const baseDir = path.posix.dirname(sourcePath);
  const candidates = [
    path.posix.normalize(path.posix.join(baseDir, importPath)),
    path.posix.normalize(path.posix.join(baseDir, `${importPath}.js`)),
    path.posix.normalize(path.posix.join(baseDir, `${importPath}.ts`)),
    path.posix.normalize(path.posix.join(baseDir, `${importPath}.tsx`)),
    path.posix.normalize(path.posix.join(baseDir, `${importPath}.jsx`)),
    path.posix.normalize(path.posix.join(baseDir, importPath, "index.js")),
    path.posix.normalize(path.posix.join(baseDir, importPath, "index.ts"))
  ];

  return candidates.find((candidate) => allPaths.has(candidate)) || null;
}

function parseJsImports(file, allPaths) {
  const edges = [];

  if (!file.content) {
    return edges;
  }

  try {
    const ast = parse(file.content, {
      sourceType: "unambiguous",
      plugins: ["jsx", "typescript", "decorators-legacy"]
    });

    traverse(ast, {
      ImportDeclaration(astPath) {
        const target = resolveImportPath(file.path, astPath.node.source.value, allPaths);
        if (target) {
          edges.push({ from: file.path, to: target, type: "import" });
        }
      },
      CallExpression(astPath) {
        const callee = astPath.node.callee;
        if (
          callee.type === "Identifier" &&
          callee.name === "require" &&
          astPath.node.arguments[0]?.type === "StringLiteral"
        ) {
          const target = resolveImportPath(file.path, astPath.node.arguments[0].value, allPaths);
          if (target) {
            edges.push({ from: file.path, to: target, type: "require" });
          }
        }
      }
    });
  } catch {
    return edges;
  }

  return edges;
}

function parsePythonImports(file, allPaths) {
  const edges = [];

  if (!file.content) {
    return edges;
  }

  const importRegexes = [
    /^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/gm,
    /^\s*import\s+([A-Za-z0-9_\.]+)/gm
  ];

  for (const regex of importRegexes) {
    let match = regex.exec(file.content);
    while (match) {
      const rawImport = match[1].replaceAll(".", "/");
      const candidates = [`${rawImport}.py`, `${rawImport}/__init__.py`];
      const target = candidates.find((candidate) => allPaths.has(candidate));
      if (target) {
        edges.push({ from: file.path, to: target, type: "python-import" });
      }
      match = regex.exec(file.content);
    }
  }

  return edges;
}

export async function buildDependencyGraph(context) {
  const allPaths = new Set(context.files.map((file) => normalizePath(file.path)));
  const edges = [];

  for (const file of context.files) {
    if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(file.extension)) {
      edges.push(...parseJsImports(file, allPaths));
    } else if (file.extension === ".py") {
      edges.push(...parsePythonImports(file, allPaths));
    }
  }

  const incomingCounts = new Map();
  for (const edge of edges) {
    incomingCounts.set(edge.to, (incomingCounts.get(edge.to) || 0) + 1);
  }

  const criticalFiles = [...incomingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([filePath, score]) => ({ path: filePath, score, reason: "Referenced by many files" }));

  return {
    nodes: context.files.map((file) => ({ path: file.path, extension: file.extension })),
    edges,
    condensed: edges.slice(0, 50),
    criticalFiles
  };
}
