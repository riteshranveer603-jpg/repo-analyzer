import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { buildPdfReport } from "./services/pdfReportService.js";
import { createAnalysisJob, getAnalysisJob } from "./services/jobStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting and URL validation for security
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const times = requestCounts.get(ip) || [];
  const recent = times.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= MAX_REQUESTS) return false;
  recent.push(now);
  requestCounts.set(ip, recent);
  return true;
}

function isValidGitHubUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();

  // Basic Security Headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/analyze", async (req, res) => {
    if (!checkRateLimit(req.ip)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    const repoUrl = req.body?.repoUrl;

    if (!repoUrl || typeof repoUrl !== "string" || !isValidGitHubUrl(repoUrl)) {
      return res.status(400).json({
        error: "A valid public GitHub repository URL is required."
      });
    }

    try {
      const job = createAnalysisJob(repoUrl);
      return res.status(202).json({
        jobId: job.id,
        status: job.status,
        stage: job.stage,
        detail: job.detail
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message.includes("GitHub") || message.includes("public repo") ? 400 : 500;
      return res.status(status).json({ error: message });
    }
  });

  app.get("/api/analyze/:jobId", (req, res) => {
    const job = getAnalysisJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Analysis job not found." });
    }

    return res.json(job);
  });

  app.get("/api/analyze/:jobId/pdf", async (req, res) => {
    const job = getAnalysisJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Analysis job not found." });
    }

    if (job.status !== "completed" || !job.report) {
      return res.status(409).json({ error: "PDF is only available after analysis is complete." });
    }

    const pdf = await buildPdfReport(job.report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"repo-analysis-report.pdf\"");
    return res.send(pdf);
  });

  app.use("/api", (_req, res) => {
    return res.status(404).json({ error: "API route not found." });
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => {
    console.log(`AI Codebase Intelligence Agent listening on http://localhost:${port}`);
  });
}
