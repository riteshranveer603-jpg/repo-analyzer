const form = document.getElementById("analyze-form");
const status = document.getElementById("status");
const results = document.getElementById("results");
const repoInput = document.getElementById("repoUrl");
const historyToggle = document.getElementById("history-toggle");
const historyClear = document.getElementById("history-clear");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const downloadPdfButton = document.getElementById("download-pdf");
const submitButton = document.getElementById("submit-btn");
const submitText = document.getElementById("submit-text");

const HISTORY_KEY = "repo-intel-history";
const HISTORY_LIMIT = 8;

const slots = {
  repoSummary: document.getElementById("repo-summary"),
  criticalFiles: document.getElementById("critical-files"),
  folderSummary: document.getElementById("folder-summary"),
  entryPoints: document.getElementById("entry-points"),
  executionFlows: document.getElementById("execution-flows"),
  requestFlows: document.getElementById("request-flows"),
  dependencyGraph: document.getElementById("dependency-graph"),
  warnings: document.getElementById("warnings")
};

let activePoll = null;
let lastCompletedJobId = null;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function rememberRepo(repoUrl) {
  const current = loadHistory().filter((item) => item.repoUrl !== repoUrl);
  current.unshift({
    repoUrl,
    savedAt: new Date().toISOString()
  });
  saveHistory(current.slice(0, HISTORY_LIMIT));
}

function formatSavedTime(savedAt) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return "Saved recently";
  }

  return `Saved on ${date.toLocaleString()}`;
}

function renderHistory() {
  const items = loadHistory();
  historyList.innerHTML = "";

  if (!items.length) {
    historyList.textContent = "No recent repo history yet.";
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";

    const info = document.createElement("div");
    info.className = "history-copy";

    const title = document.createElement("strong");
    title.textContent = item.repoUrl;

    const meta = document.createElement("span");
    meta.textContent = formatSavedTime(item.savedAt);

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "history-use";
    useButton.textContent = "Use Again";
    useButton.addEventListener("click", () => {
      repoInput.value = item.repoUrl;
      historyPanel.classList.add("hidden");
      repoInput.focus();
    });

    info.append(title, meta);
    row.append(info, useButton);
    historyList.append(row);
  }
}

function bulletList(lines) {
  return lines.filter(Boolean).join("\n\n");
}

function formatRepoSummary(summary) {
  if (!summary) return "No repository summary available.";
  const languages = summary.tech_stack?.languages?.length ? summary.tech_stack.languages.join(", ") : "not clearly detected";
  const frameworks = summary.tech_stack?.frameworks?.length ? summary.tech_stack.frameworks.join(", ") : "no major framework detected";
  const patterns = summary.notable_patterns?.length ? summary.notable_patterns.join(", ") : "no special structure was strongly detected";

  return bulletList([
    `This repo mainly uses: ${languages}.`,
    `Main framework or style: ${frameworks}.`,
    `Simple architecture view: ${summary.architecture || "No clear architecture summary was found."}`,
    `Files checked: ${summary.total_files_analyzed}.`,
    `Structure hints: ${patterns}.`
  ]);
}

function formatCriticalFiles(files) {
  if (!files?.length) {
    return "No critical files were strongly identified.";
  }

  return files
    .slice(0, 8)
    .map((file, index) => `${index + 1}. ${file.path} - ${file.reason || "Important to how the project works."}`)
    .join("\n");
}

function formatFolderSummary(folders) {
  if (!folders?.length) {
    return "No folder summary could be created.";
  }

  return folders
    .slice(0, 10)
    .map((folder) => `${folder.path}: ${folder.purpose} It contains about ${folder.fileCount} file(s).`)
    .join("\n\n");
}

function formatEntryPoints(entryPoints) {
  if (!entryPoints?.length) {
    return "No clear starting file was found, so the app may use a custom setup.";
  }

  return entryPoints
    .slice(0, 6)
    .map((entry, index) => `${index + 1}. ${entry.path} looks like a starting point because ${entry.reason.toLowerCase()}.`)
    .join("\n");
}

function formatExecutionFlows(flows) {
  if (!flows?.length) {
    return "No execution flow could be explained.";
  }

  return flows
    .slice(0, 4)
    .map((flow) => {
      const steps = flow.steps?.slice(0, 4).map((step) => step.path).join(" -> ") || flow.start;
      return `${flow.summary}\nSimple path: ${steps}`;
    })
    .join("\n\n");
}

function formatRequestFlows(flows) {
  if (!flows?.length) {
    return "No request flow was found.";
  }

  return flows
    .slice(0, 4)
    .map((flow) => {
      const chain = flow.chain?.length ? flow.chain.join(" -> ") : "No clear request path found";
      return `${flow.summary}\nRequest path: ${chain}\nConfidence: ${flow.confidence || "unknown"}`;
    })
    .join("\n\n");
}

function formatDependencyGraph(graph) {
  const edgeCount = graph?.edges?.length || 0;
  const nodeCount = graph?.nodes?.length || 0;
  const samples = graph?.condensed?.slice(0, 8) || [];

  if (!nodeCount) {
    return "No file relationship graph could be built.";
  }

  const lines = [
    `The app found ${nodeCount} file(s) and ${edgeCount} connection(s) between them.`,
    "Sample relationships:"
  ];

  if (!samples.length) {
    lines.push("No simple file-to-file links were found.");
  } else {
    for (const edge of samples) {
      lines.push(`- ${edge.from} uses ${edge.to}`);
    }
  }

  return lines.join("\n");
}

function formatWarnings(warnings) {
  if (!warnings?.length) {
    return "No major warnings. The analysis completed normally.";
  }

  return warnings.map((warning, index) => `${index + 1}. ${warning}`).join("\n");
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`Expected JSON but received ${contentType || "unknown content type"}: ${text.slice(0, 80)}`);
  }

  return response.json();
}

function fillResults(payload) {
  if (!payload) return;
  slots.repoSummary.textContent = formatRepoSummary(payload.repo_summary);
  slots.criticalFiles.textContent = formatCriticalFiles(payload.critical_files);
  slots.folderSummary.textContent = formatFolderSummary(payload.folder_summary);
  slots.entryPoints.textContent = formatEntryPoints(payload.entry_points);
  slots.executionFlows.textContent = formatExecutionFlows(payload.execution_flows);
  slots.requestFlows.textContent = formatRequestFlows(payload.request_flows);
  slots.dependencyGraph.textContent = formatDependencyGraph(payload.dependency_graph);
  slots.warnings.textContent = formatWarnings(payload.analysis_warnings);
}

async function downloadPdf() {
  if (!lastCompletedJobId) {
    status.textContent = "Run an analysis first to download the PDF.";
    return;
  }

  try {
    status.textContent = "Preparing PDF download...";
    const response = await fetch(`/api/analyze/${lastCompletedJobId}/pdf`);

    if (!response.ok) {
      const payload = await readJsonResponse(response);
      throw new Error(payload.error || "Could not create PDF.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "repo-analysis-report.pdf";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    status.textContent = "PDF downloaded.";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function pollJob(jobId) {
  if (activePoll) {
    clearTimeout(activePoll);
    activePoll = null;
  }

  const response = await fetch(`/api/analyze/${jobId}`);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load analysis status.");
  }

  status.textContent = `${payload.status}: ${payload.detail}`;

  if (payload.status === "completed") {
    lastCompletedJobId = jobId;
    fillResults(payload.report);
    rememberRepo(payload.report.repo_url);
    renderHistory();
    results.classList.remove("hidden");
    status.textContent = "Analysis complete.";
    return;
  }

  if (payload.status === "failed") {
    throw new Error(payload.error || "Analysis failed.");
  }

  await new Promise((resolve) => {
    activePoll = setTimeout(resolve, 1200);
  });

  return pollJob(jobId);
}

historyToggle.addEventListener("click", () => {
  renderHistory();
  historyPanel.classList.toggle("hidden");
});

historyClear.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

renderHistory();
downloadPdfButton.addEventListener("click", downloadPdf);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const repoUrl = new FormData(form).get("repoUrl");
  status.textContent = "Queueing analysis...";
  results.classList.add("hidden");
  lastCompletedJobId = null;

  if (submitButton) {
    submitButton.disabled = true;
    if (submitText) submitText.textContent = "Scanning...";
  }

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ repoUrl })
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Analysis failed.");
    }

    await pollJob(payload.jobId);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      if (submitText) submitText.textContent = "Initialize Scan";
    }
  }
});
