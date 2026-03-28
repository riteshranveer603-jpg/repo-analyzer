function safeParseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function detectTechStack(context) {
  const packageJsonFile = context.files.find((file) => file.path === "package.json" && file.content);
  const packageJson = packageJsonFile ? safeParseJson(packageJsonFile.content) : null;
  const packageDeps = packageJson
    ? Object.keys({
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {})
      })
    : [];

  const hasPython = context.files.some((file) => [".py", ".pyi"].includes(file.extension));
  const hasTypeScript = context.files.some((file) => [".ts", ".tsx"].includes(file.extension));
  const hasJavaScript = context.files.some((file) => [".js", ".jsx", ".mjs", ".cjs"].includes(file.extension));

  const frameworks = [];

  if (packageDeps.includes("express")) frameworks.push("Express");
  if (packageDeps.includes("next")) frameworks.push("Next.js");
  if (packageDeps.includes("@nestjs/core")) frameworks.push("NestJS");
  if (context.manifests["requirements.txt"]?.includes("fastapi") || context.manifests["pyproject.toml"]?.includes("fastapi")) {
    frameworks.push("FastAPI");
  }
  if (context.manifests["requirements.txt"]?.includes("flask") || context.manifests["pyproject.toml"]?.includes("flask")) {
    frameworks.push("Flask");
  }

  const languages = [];
  if (hasTypeScript) languages.push("TypeScript");
  if (hasJavaScript) languages.push("JavaScript");
  if (hasPython) languages.push("Python");

  const architectureHints = [];
  if (context.files.some((file) => file.path.startsWith("packages/"))) architectureHints.push("monorepo");
  if (context.files.some((file) => file.path.startsWith("apps/"))) architectureHints.push("multi-app");
  if (frameworks.length === 0 && languages.length > 0) architectureHints.push("custom application structure");

  return {
    languages,
    frameworks,
    architectureHints,
    packageJson
  };
}
