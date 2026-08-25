import { isSafePackageVersion } from "./pkg-routes.js";

export const STATS_CLIENT_TTL_SECONDS = 60;

export const STATS_PERIODS = ["all", "7d", "30d", "365d"];

const ZIP_EXTENSION = ".zip";

const WINDOW_ORDER_COLUMN = {
  all: "downloads",
  "7d": "downloads_7d",
  "30d": "downloads_30d",
  "365d": "downloads_365d",
};

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

function toCount(value) {
  return Number(value) || 0;
}

export function parseStatsPeriod(searchParams) {
  const raw = searchParams instanceof URLSearchParams
    ? searchParams.get("period")
    : null;
  if (raw == null || raw === "") {
    return { ok: true, period: "all" };
  }

  if (STATS_PERIODS.includes(raw)) {
    return { ok: true, period: raw };
  }

  return { ok: false };
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
    INSERT INTO download_events (namespace, package_id, version, target_id, downloaded_at)
    VALUES (?, ?, ?, ?, datetime('now'))
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

  if (!ctx || typeof ctx.waitUntil !== "function") {
    return;
  }

  const parsed = parseVersionedZipDownload(targetPath);
  if (!parsed || !env?.DOWNLOADS) {
    return;
  }

  ctx.waitUntil(incrementZipDownload(env, parsed).catch(() => {}));
}

function mapPackageWindowRow(row) {
  return {
    namespace: row.namespace,
    package: row.package_id ?? row.package,
    downloads: toCount(row.downloads),
    downloads_7d: toCount(row.downloads_7d),
    downloads_30d: toCount(row.downloads_30d),
    downloads_365d: toCount(row.downloads_365d),
  };
}

const PACKAGE_WINDOW_SELECT = `
  COUNT(*) AS downloads,
  SUM(CASE WHEN downloaded_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS downloads_7d,
  SUM(CASE WHEN downloaded_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS downloads_30d,
  SUM(CASE WHEN downloaded_at >= datetime('now', '-365 days') THEN 1 ELSE 0 END) AS downloads_365d
`;

async function loadStatsList(env, period) {
  const orderColumn = WINDOW_ORDER_COLUMN[period];
  const result = await env.DOWNLOADS.prepare(`
    SELECT namespace, package_id, ${PACKAGE_WINDOW_SELECT}
    FROM download_events
    GROUP BY namespace, package_id
    ORDER BY ${orderColumn} DESC, namespace ASC, package_id ASC
  `).all();

  return (result.results ?? []).map((row) => mapPackageWindowRow(row));
}

async function loadStatsPackage(env, namespace, packageId) {
  const totals = await env.DOWNLOADS.prepare(`
    SELECT ${PACKAGE_WINDOW_SELECT}
    FROM download_events
    WHERE namespace = ? AND package_id = ?
  `).bind(namespace, packageId).first();

  const artifactResult = await env.DOWNLOADS.prepare(`
    SELECT version, target_id, COUNT(*) AS count
    FROM download_events
    WHERE namespace = ? AND package_id = ?
    GROUP BY version, target_id
    ORDER BY version ASC, target_id ASC
  `).bind(namespace, packageId).all();

  const artifacts = (artifactResult.results ?? []).map((row) => ({
    version: row.version,
    target: row.target_id,
    downloads: toCount(row.count),
  }));

  return {
    namespace,
    package: packageId,
    downloads: toCount(totals?.downloads),
    downloads_7d: toCount(totals?.downloads_7d),
    downloads_30d: toCount(totals?.downloads_30d),
    downloads_365d: toCount(totals?.downloads_365d),
    artifacts,
  };
}

export async function resolveStatsResult(normalizedPath, env, searchParams) {
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

  const periodResult = parseStatsPeriod(searchParams);
  if (!periodResult.ok) {
    return {
      status: 400,
      payload: {
        error: "invalid_stats_period",
        message: "Unsupported period. Use all, 7d, 30d, or 365d.",
      },
    };
  }

  try {
    if (parsed.kind === "list") {
      return {
        status: 200,
        payload: { packages: await loadStatsList(env, periodResult.period) },
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
