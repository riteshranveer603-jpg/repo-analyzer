import assert from "node:assert/strict";

import request from "supertest";
import { createApp } from "../src/server.js";

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const app = createApp();

await run("health endpoint returns ok", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

await run("analyze endpoint validates missing repo URL", async () => {
  const response = await request(app).post("/api/analyze").send({});
  assert.equal(response.status, 400);
  assert.match(response.body.error, /required/i);
});

await run("analyze endpoint queues a job", async () => {
  const response = await request(app).post("/api/analyze").send({
    repoUrl: "https://example.com/not-github"
  });

  assert.equal(response.status, 202);
  assert.equal(typeof response.body.jobId, "string");
  assert.equal(response.body.status, "queued");
});

await run("job status endpoint rejects unknown jobs", async () => {
  const response = await request(app).get("/api/analyze/does-not-exist");
  assert.equal(response.status, 404);
});

if (!process.exitCode) {
  console.log("All tests passed.");
}
