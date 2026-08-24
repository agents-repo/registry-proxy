import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStatsPath,
  parseVersionedZipDownload,
  resolveStatsResult,
  scheduleZipDownloadCount,
  STATS_CLIENT_TTL_SECONDS,
} from "../src/download-stats.js";
import { createMemoryDownloadsDb } from "./memory-downloads-d1.js";

const ZIP_PATH = "packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip";

test("parseVersionedZipDownload accepts versioned artifact ZIPs", () => {
  assert.deepEqual(parseVersionedZipDownload(ZIP_PATH), {
    namespace: "agents-repo",
    packageId: "hello-agent",
    version: "1.0.0",
    targetId: "cursor",
  });
  assert.deepEqual(
    parseVersionedZipDownload("packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-github-copilot.zip"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: "1.0.0",
      targetId: "github-copilot",
    },
  );
});

test("parseVersionedZipDownload accepts uppercase ZIP extensions", () => {
  assert.deepEqual(
    parseVersionedZipDownload("packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.ZIP"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: "1.0.0",
      targetId: "cursor",
    },
  );
});

test("parseVersionedZipDownload rejects non-artifact paths", () => {
  assert.equal(parseVersionedZipDownload("packages/index.json"), null);
  assert.equal(
    parseVersionedZipDownload("packages/agents-repo/hello-agent/versions/1.0.0/agents/hello-agent.agent.md"),
    null,
  );
  assert.equal(
    parseVersionedZipDownload("packages/agents-repo/hello-agent/versions/1.0.0/cursor.zip"),
    null,
  );
  assert.equal(
    parseVersionedZipDownload("pkg/agents-repo/hello-agent/1.0.0/agents/hello-agent.agent.md"),
    null,
  );
  assert.equal(
    parseVersionedZipDownload("packages/../hello-agent/versions/1.0.0/1.0.0-cursor.zip"),
    null,
  );
  assert.equal(
    parseVersionedZipDownload("packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-.zip"),
    null,
  );
});

test("parseStatsPath accepts list and package paths", () => {
  assert.deepEqual(parseStatsPath("stats"), { kind: "list" });
  assert.deepEqual(parseStatsPath("stats/"), { kind: "list" });
  assert.deepEqual(parseStatsPath("stats/packages/agents-repo/hello-agent"), {
    kind: "package",
    namespace: "agents-repo",
    packageId: "hello-agent",
  });
  assert.deepEqual(parseStatsPath("stats/packages/agents-repo/hello-agent/"), {
    kind: "package",
    namespace: "agents-repo",
    packageId: "hello-agent",
  });
  assert.equal(parseStatsPath("stats/packages/hello-agent").kind, "invalid");
  assert.equal(parseStatsPath("stats/other").kind, "invalid");
  assert.equal(parseStatsPath("stats/packages/../hello-agent").kind, "invalid");
  assert.equal(parseStatsPath("stats/packages/foo%2fbar/hello-agent").kind, "invalid");
  assert.equal(parseStatsPath("stats/packages/agents-repo/..").kind, "invalid");
});

test("resolveStatsResult returns 503 without D1", async () => {
  const result = await resolveStatsResult("stats", {});
  assert.equal(result.status, 503);
  assert.equal(result.payload.error, "downloads_unavailable");
});

test("resolveStatsResult lists packages sorted by downloads", async () => {
  const env = { DOWNLOADS: createMemoryDownloadsDb() };
  const waitUntilPromises = [];
  const ctx = {
    waitUntil(promise) {
      waitUntilPromises.push(promise);
    },
  };

  scheduleZipDownloadCount(ctx, env, ZIP_PATH, 200);
  scheduleZipDownloadCount(ctx, env, ZIP_PATH, 200);
  scheduleZipDownloadCount(
    ctx,
    env,
    "packages/other-ns/other-pkg/versions/2.0.0/2.0.0-cursor.zip",
    200,
  );
  await Promise.all(waitUntilPromises);

  const listed = await resolveStatsResult("stats", env);
  assert.equal(listed.status, 200);
  assert.equal(listed.cacheControl, `public, max-age=${STATS_CLIENT_TTL_SECONDS}`);
  assert.deepEqual(listed.payload.packages, [
    { namespace: "agents-repo", package: "hello-agent", downloads: 2 },
    { namespace: "other-ns", package: "other-pkg", downloads: 1 },
  ]);

  const detail = await resolveStatsResult("stats/packages/agents-repo/hello-agent", env);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.payload, {
    namespace: "agents-repo",
    package: "hello-agent",
    downloads: 2,
    artifacts: [{ version: "1.0.0", target: "cursor", downloads: 2 }],
  });
});

test("resolveStatsResult returns zero downloads for unknown packages", async () => {
  const result = await resolveStatsResult("stats/packages/agents-repo/missing", {
    DOWNLOADS: createMemoryDownloadsDb(),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    namespace: "agents-repo",
    package: "missing",
    downloads: 0,
    artifacts: [],
  });
});

test("resolveStatsResult returns 400 for invalid stats paths", async () => {
  const result = await resolveStatsResult("stats/other", {
    DOWNLOADS: createMemoryDownloadsDb(),
  });
  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "invalid_stats_path");
});

test("resolveStatsResult returns 503 when D1 queries throw", async () => {
  const result = await resolveStatsResult("stats", {
    DOWNLOADS: {
      prepare() {
        throw new Error("d1 unavailable");
      },
    },
  });
  assert.equal(result.status, 503);
  assert.equal(result.payload.error, "downloads_unavailable");
});

test("scheduleZipDownloadCount skips non-200, missing D1, and missing waitUntil", async () => {
  const env = { DOWNLOADS: createMemoryDownloadsDb() };
  const waitUntilPromises = [];
  const ctx = {
    waitUntil(promise) {
      waitUntilPromises.push(promise);
    },
  };

  scheduleZipDownloadCount(ctx, env, ZIP_PATH, 304);
  scheduleZipDownloadCount(ctx, env, ZIP_PATH, 404);
  scheduleZipDownloadCount(ctx, {}, ZIP_PATH, 200);
  scheduleZipDownloadCount({}, env, ZIP_PATH, 200);
  scheduleZipDownloadCount(null, env, ZIP_PATH, 200);
  assert.equal(waitUntilPromises.length, 0);

  const listed = await resolveStatsResult("stats", env);
  assert.deepEqual(listed.payload.packages, []);
});
