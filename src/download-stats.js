import { isSafePackageVersion } from "./pkg-routes.js";

export const STATS_CLIENT_TTL_SECONDS = 60;

const ZIP_EXTENSION = ".zip";

function segmentContainsPathSeparatorEncoding(segment) {
  return /%2[fF]|%5[cC]/.test(segment);
}

function isSafeStatsSegment(segment) {
  if (!segment || segment === "." || segment === "..") {
    return false;
  }

  if (segment.includes("/") || segment.includes("\\")) {
    return false;
  }

  return !segmentContainsPathSeparatorEncoding(segment);
}

function trimTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

export function parseVersionedZipDownload(targetPath) {
  const segments = String(targetPath || "").split("/").filter(Boolean);
  if (segments.length !== 6) {
    return null;
  }

  if (segments[0] !== "packages" || segments[3] !== "versions") {
    return null;
  }

  const namespace = segments[1];
  const packageId = segments[2];
  const version = segments[4];
  const filename = segments[5];

  if (!isSafeStatsSegment(namespace) || !isSafeStatsSegment(packageId)) {
    return null;
  }

  if (!isSafePackageVersion(version)) {
    return null;
  }

  if (!filename.toLowerCase().endsWith(ZIP_EXTENSION)) {
    return null;
  }

  const prefix = `${version}-`;
  if (!filename.startsWith(prefix)) {
    return null;
  }

  const targetId = filename.slice(prefix.length, filename.length - ZIP_EXTENSION.length);
  if (!isSafeStatsSegment(targetId)) {
    return null;
  }

  return {
    namespace,
    packageId,
    version,
    targetId,
  };
}

export function parseStatsPath(normalizedPath) {
  const trimmed = trimTrailingSlashes(String(normalizedPath || ""));
  if (trimmed === "stats") {
    return { kind: "list" };
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (
    segments.length === 4
    && segments[0] === "stats"
    && segments[1] === "packages"
  ) {
    const namespace = segments[2];
    const packageId = segments[3];
    if (!isSafeStatsSegment(namespace) || !isSafeStatsSegment(packageId)) {
      return { kind: "invalid" };
    }

    return { kind: "package", namespace, packageId };
  }

  return { kind: "invalid" };
}

export async function incrementZipDownload(env, parsed) {
  await env.DOWNLOADS.prepare(`
    INSERT INTO download_counts (namespace, package_id, version, target_id, count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (namespace, package_id, version, target_id)
    DO UPDATE SET count = count + 1
  `).bind(
    parsed.namespace,
    parsed.packageId,
    parsed.version,
    parsed.targetId,
  ).run();
}

export function scheduleZipDownloadCount(ctx, env, targetPath, status) {
  if (status !== 200) {
    return;
  }

  const parsed = parseVersionedZipDownload(targetPath);
  if (!parsed || !env?.DOWNLOADS) {
    return;
  }

  const task = incrementZipDownload(env, parsed).catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(task);
  }
}

async function loadStatsList(env) {
  const result = await env.DOWNLOADS.prepare(`
    SELECT namespace, package_id, SUM(count) AS downloads
    FROM download_counts
    GROUP BY namespace, package_id
    ORDER BY downloads DESC, namespace ASC, package_id ASC
  `).all();

  return (result.results ?? []).map((row) => ({
    namespace: row.namespace,
    package: row.package_id,
    downloads: Number(row.downloads) || 0,
  }));
}

async function loadStatsPackage(env, namespace, packageId) {
  const result = await env.DOWNLOADS.prepare(`
    SELECT version, target_id, count
    FROM download_counts
    WHERE namespace = ? AND package_id = ?
    ORDER BY version ASC, target_id ASC
  `).bind(namespace, packageId).all();

  const artifacts = (result.results ?? []).map((row) => ({
    version: row.version,
    target: row.target_id,
    downloads: Number(row.count) || 0,
  }));

  return {
    namespace,
    package: packageId,
    downloads: artifacts.reduce((sum, artifact) => sum + artifact.downloads, 0),
    artifacts,
  };
}

export async function resolveStatsResult(normalizedPath, env) {
  if (!env?.DOWNLOADS) {
    return {
      status: 503,
      payload: {
        error: "downloads_unavailable",
        message: "Download stats storage is not configured.",
      },
    };
  }

  const parsed = parseStatsPath(normalizedPath);
  if (parsed.kind === "invalid") {
    return {
      status: 400,
      payload: {
        error: "invalid_stats_path",
        message: "Unsupported /stats path shape. Use /stats or /stats/packages/<namespace>/<package-id>.",
      },
    };
  }

  try {
    if (parsed.kind === "list") {
      return {
        status: 200,
        payload: { packages: await loadStatsList(env) },
        cacheControl: `public, max-age=${STATS_CLIENT_TTL_SECONDS}`,
      };
    }

    return {
      status: 200,
      payload: await loadStatsPackage(env, parsed.namespace, parsed.packageId),
      cacheControl: `public, max-age=${STATS_CLIENT_TTL_SECONDS}`,
    };
  } catch {
    return {
      status: 503,
      payload: {
        error: "downloads_unavailable",
        message: "Download stats storage is not available.",
      },
    };
  }
}
