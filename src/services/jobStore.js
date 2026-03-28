import crypto from "crypto";

import { analyzeRepoFromUrl } from "./analyzeRepoService.js";

const jobs = new Map();

function createJobRecord(repoUrl) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    repoUrl,
    status: "queued",
    stage: "queued",
    detail: "Waiting to start",
    createdAt: now,
    updatedAt: now,
    report: null,
    error: null
  };

  jobs.set(id, job);
  return job;
}

function updateJob(jobId, patch) {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  jobs.set(jobId, next);
  return next;
}

async function runAnalysis(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  updateJob(jobId, {
    status: "running",
    stage: "starting",
    detail: "Preparing analysis"
  });

  try {
    const report = await analyzeRepoFromUrl(job.repoUrl, {
      onProgress(progress) {
        updateJob(jobId, {
          status: "running",
          ...progress
        });
      }
    });

    updateJob(jobId, {
      status: "completed",
      stage: "completed",
      detail: "Analysis complete",
      report
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      stage: "failed",
      detail: "Analysis failed",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

export function createAnalysisJob(repoUrl) {
  const job = createJobRecord(repoUrl);
  queueMicrotask(() => {
    runAnalysis(job.id);
  });
  return job;
}

export function getAnalysisJob(jobId) {
  return jobs.get(jobId) || null;
}
