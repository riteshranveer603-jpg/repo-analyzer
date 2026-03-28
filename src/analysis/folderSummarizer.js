function inferFolderPurpose(folder, files, techStack) {
  const names = files.map((file) => file.path.split("/").pop() || "");

  if (folder === "src") return "Primary application source code.";
  if (folder === "app") return "Application layer containing framework routes or bootstrap modules.";
  if (folder === "routes") return "HTTP route definitions and request handlers.";
  if (folder === "controllers") return "Controller layer that coordinates request handling.";
  if (folder === "services") return "Business logic and domain service modules.";
  if (folder === "models" || folder === "schemas") return "Data models, schemas, or persistence contracts.";
  if (folder === "db" || folder === "database") return "Database configuration, queries, or migrations.";
  if (folder === "packages") return "Workspace packages in a monorepo structure.";
  if (folder === "tests" || folder === "__tests__") return "Automated tests.";
  if (names.some((name) => name.includes("config"))) return "Configuration and environment setup.";
  if (techStack.frameworks.includes("Next.js") && folder === "pages") return "Next.js page routes.";
  return "Supporting project code and configuration.";
}

export function summarizeFolders(context, techStack) {
  const grouped = new Map();

  for (const file of context.files) {
    const topLevel = file.path.split("/")[0];
    if (!grouped.has(topLevel)) {
      grouped.set(topLevel, []);
    }
    grouped.get(topLevel).push(file);
  }

  return [...grouped.entries()]
    .map(([folder, files]) => ({
      path: folder,
      purpose: inferFolderPurpose(folder, files, techStack),
      notableFiles: files.slice(0, 5).map((file) => file.path),
      fileCount: files.length
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
