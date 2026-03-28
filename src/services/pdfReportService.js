import PDFDocument from "pdfkit";

function collectLines(report) {
  const lines = [];

  lines.push("Repo Analysis Report");
  lines.push(`Repository: ${report.repo_url}`);
  lines.push(`Generated at: ${report.generated_at}`);
  lines.push("");

  const summary = report.repo_summary || {};
  lines.push("Repo Summary");
  lines.push(`Main languages: ${summary.tech_stack?.languages?.join(", ") || "Not clearly detected"}`);
  lines.push(`Frameworks: ${summary.tech_stack?.frameworks?.join(", ") || "No major framework detected"}`);
  lines.push(`Architecture: ${summary.architecture || "No clear architecture summary"}`);
  lines.push(`Files checked: ${summary.total_files_analyzed || 0}`);
  lines.push("");

  lines.push("Critical Files");
  if (report.critical_files?.length) {
    for (const file of report.critical_files.slice(0, 10)) {
      lines.push(`- ${file.path}: ${file.reason || "Important file"}`);
    }
  } else {
    lines.push("- No critical files were strongly identified.");
  }
  lines.push("");

  lines.push("Folder Summary");
  if (report.folder_summary?.length) {
    for (const folder of report.folder_summary.slice(0, 10)) {
      lines.push(`- ${folder.path}: ${folder.purpose} About ${folder.fileCount} file(s).`);
    }
  } else {
    lines.push("- No folder summary could be created.");
  }
  lines.push("");

  lines.push("Entry Points");
  if (report.entry_points?.length) {
    for (const entry of report.entry_points.slice(0, 8)) {
      lines.push(`- ${entry.path}: ${entry.reason}`);
    }
  } else {
    lines.push("- No clear starting file was found.");
  }
  lines.push("");

  lines.push("Execution Flows");
  if (report.execution_flows?.length) {
    for (const flow of report.execution_flows.slice(0, 4)) {
      lines.push(`- ${flow.summary}`);
      if (flow.steps?.length) {
        lines.push(`  Path: ${flow.steps.slice(0, 5).map((step) => step.path).join(" -> ")}`);
      }
    }
  } else {
    lines.push("- No execution flow could be explained.");
  }
  lines.push("");

  lines.push("Request Flows");
  if (report.request_flows?.length) {
    for (const flow of report.request_flows.slice(0, 4)) {
      lines.push(`- ${flow.summary}`);
      lines.push(`  Path: ${flow.chain?.join(" -> ") || "No clear request path found"}`);
    }
  } else {
    lines.push("- No request flow was found.");
  }
  lines.push("");

  lines.push("Dependency Graph");
  lines.push(`Files found: ${report.dependency_graph?.nodes?.length || 0}`);
  lines.push(`Connections found: ${report.dependency_graph?.edges?.length || 0}`);
  if (report.dependency_graph?.condensed?.length) {
    for (const edge of report.dependency_graph.condensed.slice(0, 8)) {
      lines.push(`- ${edge.from} uses ${edge.to}`);
    }
  } else {
    lines.push("- No simple file-to-file links were found.");
  }
  lines.push("");

  lines.push("Warnings");
  if (report.analysis_warnings?.length) {
    for (const warning of report.analysis_warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push("- No major warnings.");
  }

  return lines;
}

export async function buildPdfReport(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).fillColor("#1e1b18").text("Repo Analysis Report");
    doc.moveDown();
    doc.fontSize(11).fillColor("#3f352d");

    for (const line of collectLines(report)) {
      if (line === "") {
        doc.moveDown(0.8);
        continue;
      }

      if (!line.startsWith("-") && !line.startsWith("  ") && !line.includes(":") && line !== "Repo Analysis Report") {
        doc.fontSize(15).fillColor("#1e1b18").text(line);
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor("#3f352d");
      } else {
        doc.text(line, {
          width: 495
        });
      }
    }

    doc.end();
  });
}
