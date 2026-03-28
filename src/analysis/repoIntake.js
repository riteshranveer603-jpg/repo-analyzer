import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "coverage"
]);

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 200_000;

function isGitHubRepoUrl(repoUrl) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") {
      return false;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length >= 2;
  } catch {
    return false;
  }
}

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function cloneRepo(repoUrl, targetDir) {
  await runGit(["clone", "--depth", "1", repoUrl, targetDir], process.cwd());
}

async function enumerateFiles(rootDir, currentDir = rootDir, bucket = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await enumerateFiles(rootDir, absolutePath, bucket);
      }
      continue;
    }

    const stats = await fs.stat(absolutePath);
    bucket.push({
      path: relativePath,
      absolutePath,
      extension: path.extname(entry.name).toLowerCase(),
      size: stats.size
    });

    if (bucket.length >= MAX_FILES) {
      return bucket;
    }
  }

  return bucket;
}

async function readSafeFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    return null;
  }

  const content = await fs.readFile(file.absolutePath, "utf8");
  return {
    ...file,
    content
  };
}

export async function withClonedRepo(repoUrl, callback) {
  if (!isGitHubRepoUrl(repoUrl)) {
    throw new Error("Please provide a valid public GitHub repository URL.");
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repo-intel-"));
  const repoDir = path.join(tempRoot, "repo");

  try {
    await cloneRepo(repoUrl, repoDir);
    return await callback({ tempRoot, repoDir });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Repository not found")) {
      throw new Error("Unable to access that GitHub repository. Make sure it is public and exists.");
    }
    throw error;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function collectRepoContext(workspace) {
  const files = await enumerateFiles(workspace.repoDir);
  const enrichedFiles = [];

  for (const file of files) {
    try {
      const enriched = await readSafeFile(file);
      enrichedFiles.push(enriched ?? { ...file, content: null });
    } catch {
      enrichedFiles.push({ ...file, content: null });
    }
  }

  const manifests = {};
  for (const file of enrichedFiles) {
    if (!file.content) {
      continue;
    }

    if (["package.json", "requirements.txt", "pyproject.toml", "Pipfile", "Dockerfile"].some((name) => file.path.endsWith(name))) {
      manifests[file.path] = file.content;
    }
  }

  return {
    repoDir: workspace.repoDir,
    files: enrichedFiles,
    manifests
  };
}
