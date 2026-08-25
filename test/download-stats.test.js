import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStatsPath,
  parseStatsPeriod,
  parseVersionedZipDownload,
  resolveStatsResult,
  scheduleZipDownloadCount,
  STATS_CLIENT_TTL_SECONDS,
} from "../src/download-stats.js";
import { createMemoryDownloadsDb } from "./memory-downloads-d1.js";

const ZIP_PATH = "packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip";

function windows(count) {
  return {
    downloads: count,
    downloads_7d: count,
    downloads_30d: count,
    downloads_365d: count,
  };
}

function packageWindows(namespace, packageId, count) {
  return {
    namespace,
    package: packageId,
    ...windows(count),
  };
}

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

test("parseStatsPeriod accepts omitted all 7d 30d and 365d", () => {
  assert.deepEqual(parseStatsPeriod(new URLSearchParams()), { ok: true, period: "all" });
  assert.deepEqual(parseStatsPeriod(new URLSearchParams("period=all")), { ok: true, period: "all" });
  assert.deepEqual(parseStatsPeriod(new URLSearchParams("period=7d")), { ok: true, period: "7d" });
  assert.deepEqual(parseStatsPeriod(new URLSearchParams("period=30d")), { ok: true, period: "30d" });
  assert.deepEqual(parseStatsPeriod(new URLSearchParams("period=365d")), { ok: true, period: "365d" });
  assert.deepEqual(parseStatsPeriod(new URLSearchParams("ref=v2.x")), { ok: true, period: "all" });
  assert.equal(parseStatsPeriod(new URLSearchParams("period=today")).ok, false);
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
    packageWindows("agents-repo", "hello-agent", 2),
    packageWindows("other-ns", "other-pkg", 1),
  ]);

  const detail = await resolveStatsResult("stats/packages/agents-repo/hello-agent", env);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.payload, {
    ...packageWindows("agents-repo", "hello-agent", 2),
    artifacts: [{ version: "1.0.0", target: "cursor", downloads: 2 }],
  });
});

test("resolveStatsResult returns zero downloads for unknown packages", async () => {
  const result = await resolveStatsResult("stats/packages/agents-repo/missing", {
    DOWNLOADS: createMemoryDownloadsDb(),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    ...packageWindows("agents-repo", "missing", 0),
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

test("resolveStatsResult returns 400 for unknown period", async () => {
  const result = await resolveStatsResult("stats", {
    DOWNLOADS: createMemoryDownloadsDb(),
  }, new URLSearchParams("period=today"));
  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "invalid_stats_period");
});

test("resolveStatsResult orders the list by the requested period", async () => {
  const env = { DOWNLOADS: createMemoryDownloadsDb({ now: "2026-08-25 12:00:00" }) };
  env.DOWNLOADS.seedEvent({
    namespace: "agents-repo",
    package_id: "recent-pkg",
    version: "1.0.0",
    target_id: "cursor",
    downloaded_at: "2026-08-24 12:00:00",
  });
  env.DOWNLOADS.seedEvent({
    namespace: "agents-repo",
    package_id: "old-pkg",
    version: "1.0.0",
    target_id: "cursor",
    downloaded_at: "2025-01-01 12:00:00",
  });
  env.DOWNLOADS.seedEvent({
    namespace: "agents-repo",
    package_id: "old-pkg",
    version: "1.0.0",
    target_id: "cursor",
    downloaded_at: "2025-01-02 12:00:00",
  });

  const byAll = await resolveStatsResult("stats", env, new URLSearchParams("period=all"));
  assert.deepEqual(byAll.payload.packages.map((row) => row.package), ["old-pkg", "recent-pkg"]);
  assert.equal(byAll.payload.packages[0].downloads, 2);
  assert.equal(byAll.payload.packages[0].downloads_7d, 0);
  assert.equal(byAll.payload.packages[1].downloads_7d, 1);

  const by7d = await resolveStatsResult("stats", env, new URLSearchParams("period=7d"));
  assert.deepEqual(by7d.payload.packages.map((row) => row.package), ["recent-pkg", "old-pkg"]);

  const detail = await resolveStatsResult(
    "stats/packages/agents-repo/old-pkg",
    env,
    new URLSearchParams("period=7d"),
  );
  assert.equal(detail.payload.downloads, 2);
  assert.equal(detail.payload.downloads_7d, 0);
  assert.equal(detail.payload.downloads_365d, 0);
  assert.deepEqual(detail.payload.artifacts, [
    { version: "1.0.0", target: "cursor", downloads: 2 },
  ]);
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
