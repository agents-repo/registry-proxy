import { resolvePkgProxyTarget, isSafePackageVersion, DEFAULT_REF } from "./pkg-routes.js";
import { withResolvedContentType } from "./content-type.js";
import {
  STATS_CLIENT_TTL_SECONDS,
  resolveStatsResult,
  scheduleZipDownloadCount,
} from "./download-stats.js";

const REPO_OWNER = "agents-repo";
const REPO_NAME = "registry";
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;
const CONTENTS_API_BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const TAGS_API_BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags`;
const TAGS_API_PAGE_SIZE = 100;
const TAGS_EDGE_TTL_SECONDS = 300;
const TAGS_CACHED_AT_HEADER = "X-Registry-Proxy-Tags-Cached-At";
const CATALOG_EDGE_TTL_SECONDS = TAGS_EDGE_TTL_SECONDS;
const CATALOG_CACHED_AT_HEADER = "X-Registry-Proxy-Catalog-Cached-At";
const VERSIONED_CLIENT_TTL_SECONDS = TAGS_EDGE_TTL_SECONDS;
const KNOWN_CONTENT_ROOTS = ["packages"];
const MAX_PATH_DECODE_PASSES = 8;
const CORS_ALLOW_ORIGIN = "*";
const CORS_ALLOW_METHODS = "GET, OPTIONS";
const CORS_ALLOW_HEADERS = "Accept, If-None-Match, If-Modified-Since";
const CORS_MAX_AGE = "86400";
const UPSTREAM_USER_AGENT = "registry-proxy-worker/0.1.0 (+https://github.com/agents-repo/registry-proxy)";

function corsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
      "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
      "Access-Control-Max-Age": CORS_MAX_AGE,
    },
  });
}

function requestHasConditionalHeaders(requestHeaders) {
  return requestHeaders.has("If-None-Match") || requestHeaders.has("If-Modified-Since");
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(payload, status = 200) {
  return withCors(new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  }));
}

const PACKAGE_ROOT_FILES = new Set(["index.json", "tree.json"]);

function legacyFlatPathResponse() {
  return jsonResponse({
    error: "legacy_flat_path_not_supported",
    message: "Flat package paths (packages/<package-id>/...) are no longer supported. Use packages/<namespace>/<package-id>/...",
  }, 400);
}

function isLegacyFlatPackagePath(targetPath) {
  if (!targetPath.startsWith("packages/")) {
    return false;
  }

  const segments = targetPath.slice("packages/".length).split("/").filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  const firstSegment = segments[0];
  if (PACKAGE_ROOT_FILES.has(firstSegment)) {
    return false;
  }

  if (segments.length === 1) {
    return true;
  }

  return segments[1] === "versions";
}

function usagePayload() {
  return {
    message: `Use this Worker to proxy files from agents-repo/registry by ref. When ref is omitted, ${DEFAULT_REF} is used.`,
    repository: `${REPO_OWNER}/${REPO_NAME}`,
    default_ref: DEFAULT_REF,
    supported_formats: [
      "/<ref>/<path>",
      "/<path>",
      "/<path>?ref=<ref>",
      "/pkg/<namespace>/<package-id>/...[?ref=<ref>][&version=<semver>]",
      "/tags",
      "/stats",
      "/stats/packages/<namespace>/<package-id>",
    ],
    examples: [
      "/main/packages/index.json",
      "/packages/index.json",
      "/README.md",
      "/main/packages/tree.json",
      "/main/packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip",
      "/packages/index.json?ref=main",
      "/packages/index.json?ref=release-2026-06",
      "/packages/index.json?ref=v1.0.0",
      "/packages/index.json?ref=d34db33fd34db33fd34db33fd34db33fd34db33f",
      "/pkg/agents-repo/hello-agent/1.0.1/agents/hello-agent.agent.md",
      "/pkg/agents-repo/hello-agent/flows/hello-agents?ref=v2.x&version=1.0.0",
      "/pkg/agents-repo/hello-agent/1.0.0/instructions.json?ref=v2.x",
      "/tags",
      "/stats",
      "/stats/packages/agents-repo/hello-agent",
    ],
  };
}

function usageResponse() {
  return jsonResponse(usagePayload(), 200);
}

function pkgErrorResponse(payload, status = 400) {
  return jsonResponse(payload, status);
}

function invalidPathResponse() {
  return jsonResponse({
    error: "invalid_path",
    message: "Path contains unsafe segments.",
  }, 400);
}

function decodePathValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasUnsafePathSegments(pathValue) {
  const segments = pathValue.split("/");
  return segments.some((segment) => segment === "." || segment === "..");
}

function containsPathTraversal(pathValue) {
  let currentValue = pathValue;

  for (let index = 0; index < MAX_PATH_DECODE_PASSES; index += 1) {
    if (hasUnsafePathSegments(currentValue)) {
      return true;
    }

    const decodedValue = decodePathValue(currentValue);
    if (decodedValue === currentValue) {
      break;
    }

    currentValue = decodedValue;
  }

  if (hasUnsafePathSegments(currentValue)) {
    return true;
  }

  // If decoding still changes after the safety cap, treat as unsafe input.
  return decodePathValue(currentValue) !== currentValue;
}

function trimLeadingSlashes(value) {
  let index = 0;
  while (index < value.length && value[index] === "/") {
    index += 1;
  }
  return value.slice(index);
}

function trimSlashEdges(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "/") {
    start += 1;
  }
  while (end > start && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(start, end);
}

function normalizePath(pathname) {
  const normalizedPath = trimLeadingSlashes(pathname || "/");
  if (!normalizedPath) {
    return "";
  }

  if (containsPathTraversal(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

function normalizeRef(refValue) {
  const normalizedRef = trimSlashEdges(String(refValue || ""));
  if (!normalizedRef) {
    return null;
  }

  if (containsPathTraversal(normalizedRef)) {
    return null;
  }

  return normalizedRef;
}

function splitPathStyle(path) {
  const separatorIndex = path.indexOf("/");
  if (separatorIndex === -1) {
    return null;
  }

  const ref = path.slice(0, separatorIndex);
  const targetPath = path.slice(separatorIndex + 1);
  if (!ref || !targetPath) {
    return null;
  }

  return { ref, targetPath };
}

function isKnownContentPath(pathValue) {
  for (const root of KNOWN_CONTENT_ROOTS) {
    if (pathValue === root || pathValue.startsWith(`${root}/`)) {
      return true;
    }
  }

  return false;
}

function getProxyTarget(requestUrl) {
  const path = normalizePath(requestUrl.pathname);
  if (path === null) {
    return { kind: "invalid_path" };
  }

  if (!path || path === "main" || path === "main/") {
    return { kind: "usage" };
  }

  if (path === "tags" || path === "tags/") {
    return { kind: "tags" };
  }

  const queryRef = requestUrl.searchParams.get("ref");
  if (queryRef !== null) {
    const normalizedRef = normalizeRef(queryRef);
    if (!normalizedRef) {
      return { kind: "invalid_path" };
    }

    let targetPath = path;
    const pathStyle = splitPathStyle(path);
    if (pathStyle && isKnownContentPath(pathStyle.targetPath)) {
      targetPath = pathStyle.targetPath;
    }

    return {
      kind: "proxy",
      ref: normalizedRef,
      targetPath,
    };
  }

  if (isKnownContentPath(path)) {
    return {
      kind: "proxy",
      ref: DEFAULT_REF,
      targetPath: path,
    };
  }

  const pathStyle = splitPathStyle(path);
  if (pathStyle) {
    const normalizedRef = normalizeRef(pathStyle.ref);
    if (!normalizedRef) {
      return { kind: "invalid_path" };
    }

    return {
      kind: "proxy",
      ref: normalizedRef,
      targetPath: pathStyle.targetPath,
    };
  }

  return {
    kind: "proxy",
    ref: DEFAULT_REF,
    targetPath: path,
  };
}

function encodeRef(ref) {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function buildUpstreamUrl(ref, targetPath) {
  const normalizedPath = trimLeadingSlashes(targetPath);
  return `${RAW_BASE_URL}/${encodeRef(ref)}/${normalizedPath}`;
}

function buildContentsApiUrl(ref, targetPath) {
  const normalizedPath = trimLeadingSlashes(targetPath);
  return `${CONTENTS_API_BASE_URL}/${normalizedPath}?ref=${encodeURIComponent(ref)}`;
}

function buildTagsApiUrl(page = 1) {
  return `${TAGS_API_BASE_URL}?per_page=${TAGS_API_PAGE_SIZE}&page=${page}`;
}

function buildTagsUpstreamHeaders(env) {
  const headers = new Headers();
  headers.set("User-Agent", UPSTREAM_USER_AGENT);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  if (env.GITHUB_TOKEN) {
    headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  }

  return headers;
}

function parseLinkHeaderNextUrl(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  const nextLink = linkHeader
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith('rel="next"'));

  if (!nextLink) {
    return null;
  }

  const match = /^<([^>]+)>/.exec(nextLink);
  return match?.[1] ?? null;
}

async function fetchAllRepositoryTags(env) {
  const tags = [];
  let nextUrl = buildTagsApiUrl(1);
  const headers = buildTagsUpstreamHeaders(env);

  while (nextUrl) {
    let upstreamResponse;

    try {
      upstreamResponse = await fetch(nextUrl, {
        method: "GET",
        headers,
      });
    } catch {
      throw new Error("tags_upstream_fetch_failed");
    }

    if (!upstreamResponse.ok) {
      return {
        ok: false,
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        body: upstreamResponse.body,
      };
    }

    const pagePayload = await upstreamResponse.json();
    if (Array.isArray(pagePayload)) {
      tags.push(...pagePayload);
    }

    nextUrl = parseLinkHeaderNextUrl(upstreamResponse.headers.get("Link"));
  }

  return {
    ok: true,
    tags,
  };
}

function buildTagsCacheKey() {
  return new Request(`${TAGS_API_BASE_URL}?per_page=${TAGS_API_PAGE_SIZE}`, { method: "GET" });
}

function getTagsCachedAtMs(response) {
  const rawValue = response.headers.get(TAGS_CACHED_AT_HEADER);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function isEdgeCacheFresh(cachedAtMs, ttlSeconds, nowMs = Date.now()) {
  if (cachedAtMs > nowMs) {
    return false;
  }

  return nowMs - cachedAtMs <= ttlSeconds * 1000;
}

function isTagsEdgeCacheFresh(cachedAtMs, nowMs = Date.now()) {
  return isEdgeCacheFresh(cachedAtMs, TAGS_EDGE_TTL_SECONDS, nowMs);
}

function isCatalogEdgeCacheFresh(cachedAtMs, nowMs = Date.now()) {
  return isEdgeCacheFresh(cachedAtMs, CATALOG_EDGE_TTL_SECONDS, nowMs);
}

function classifyProxyCacheClass(targetPath) {
  if (targetPath === "packages/index.json" || targetPath === "packages/tree.json") {
    return "catalog";
  }

  const segments = targetPath.split("/").filter(Boolean);
  if (segments.length === 4 && segments[0] === "packages" && segments[3] === "detail.json") {
    return "catalog";
  }

  if (
    segments.length >= 5 &&
    segments[0] === "packages" &&
    segments[3] === "versions" &&
    isSafePackageVersion(segments[4])
  ) {
    return "versioned";
  }

  return "other";
}

function getCatalogCachedAtMs(response) {
  const rawValue = response.headers.get(CATALOG_CACHED_AT_HEADER);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function withClientCacheControl(response, maxAgeSeconds) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
  headers.set("Cache-Control", `public, max-age=${maxAgeSeconds}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withCatalogClientResponse(response) {
  return withClientCacheControl(response, CATALOG_EDGE_TTL_SECONDS);
}

function withVersionedClientResponse(response) {
  return withClientCacheControl(response, VERSIONED_CLIENT_TTL_SECONDS);
}

function buildCatalogStoredResponse(response, cachedAtMs = Date.now()) {
  const headers = new Headers(response.headers);
  headers.delete("Cache-Control");
  headers.set(CATALOG_CACHED_AT_HEADER, String(cachedAtMs));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildFileStoredResponse(response) {
  const headers = new Headers(response.headers);
  headers.delete("Cache-Control");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildTagsCacheResponse(tags, cachedAtMs = Date.now()) {
  return new Response(JSON.stringify(tags, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      [TAGS_CACHED_AT_HEADER]: String(cachedAtMs),
    },
  });
}

function withTagsClientResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
  headers.set("Cache-Control", `public, max-age=${TAGS_EDGE_TTL_SECONDS}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildUpstreamRequest(target, env, requestHeaders) {
  const headers = new Headers();
  const requestAccept = requestHeaders.get("Accept") || "*/*";
  headers.set("User-Agent", UPSTREAM_USER_AGENT);

  const ifNoneMatch = requestHeaders.get("If-None-Match");
  if (ifNoneMatch) {
    headers.set("If-None-Match", ifNoneMatch);
  }

  const ifModifiedSince = requestHeaders.get("If-Modified-Since");
  if (ifModifiedSince) {
    headers.set("If-Modified-Since", ifModifiedSince);
  }

  if (env.GITHUB_TOKEN) {
    headers.set("Accept", "application/vnd.github.raw");
    headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
    return {
      url: buildContentsApiUrl(target.ref, target.targetPath),
      headers,
    };
  }

  headers.set("Accept", requestAccept);

  return {
    url: buildUpstreamUrl(target.ref, target.targetPath),
    headers,
  };
}

export {
  buildCanonicalPackagePath,
  isSafePackageVersion,
  parsePkgPath,
  resolvePkgProxyTarget,
} from "./pkg-routes.js";

export {
  buildContentsApiUrl,
  buildTagsApiUrl,
  buildTagsCacheKey,
  buildTagsCacheResponse,
  buildCatalogStoredResponse,
  buildUpstreamRequest,
  buildUpstreamUrl,
  encodeRef,
  getProxyTarget,
  getTagsCachedAtMs,
  CATALOG_CACHED_AT_HEADER,
  CATALOG_EDGE_TTL_SECONDS,
  classifyProxyCacheClass,
  isCatalogEdgeCacheFresh,
  isLegacyFlatPackagePath,
  isTagsEdgeCacheFresh,
  normalizePath,
  normalizeRef,
  splitPathStyle,
  TAGS_API_BASE_URL,
  TAGS_CACHED_AT_HEADER,
  TAGS_EDGE_TTL_SECONDS,
  UPSTREAM_USER_AGENT,
  VERSIONED_CLIENT_TTL_SECONDS,
  STATS_CLIENT_TTL_SECONDS,
};

async function handleTagsRoute(env, ctx) {
  const cache = caches.default;
  const cacheKey = buildTagsCacheKey();
  const cached = await cache.match(cacheKey);
  if (cached) {
    const cachedAtMs = getTagsCachedAtMs(cached);
    if (cachedAtMs !== null && isTagsEdgeCacheFresh(cachedAtMs)) {
      return withTagsClientResponse(cached);
    }
  }

  let tagsResult;
  try {
    tagsResult = await fetchAllRepositoryTags(env);
  } catch {
    if (cached) {
      return withTagsClientResponse(cached);
    }

    return withCors(new Response("Bad Gateway", { status: 502 }));
  }

  if (!tagsResult.ok) {
    if (cached) {
      return withTagsClientResponse(cached);
    }

    const response = new Response(tagsResult.body, {
      status: tagsResult.status,
      statusText: tagsResult.statusText,
      headers: new Headers({
        "content-type": "application/json; charset=utf-8",
      }),
    });
    return withCors(response);
  }

  const cacheResponse = buildTagsCacheResponse(tagsResult.tags);
  ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
  return withTagsClientResponse(cacheResponse);
}

async function fetchManifestLatest(ref, manifestPath, env, requestHeaders) {
  const target = { ref, targetPath: manifestPath };
  const upstreamRequest = buildUpstreamRequest(target, env, requestHeaders);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamRequest.url, {
      method: "GET",
      headers: upstreamRequest.headers,
    });
  } catch {
    return { ok: false };
  }

  if (!upstreamResponse.ok) {
    return { ok: false, status: upstreamResponse.status };
  }

  let payload;
  try {
    payload = await upstreamResponse.json();
  } catch {
    return { ok: false };
  }

  const latest = payload?.latest;
  if (typeof latest !== "string" || !latest.trim()) {
    return { ok: false };
  }

  const normalizedLatest = latest.trim();
  if (!isSafePackageVersion(normalizedLatest)) {
    return { ok: false };
  }

  return { ok: true, latest: normalizedLatest };
}

async function resolvePkgRouteTarget(requestUrl, env, requestHeaders) {
  return resolvePkgProxyTarget(requestUrl, {
    normalizePath,
    normalizeRef,
    fetchManifestLatest: (ref, manifestPath) => fetchManifestLatest(ref, manifestPath, env, requestHeaders),
  });
}

function clientFileProxyResponse(response, cacheClass) {
  if (cacheClass === "catalog") {
    return withCatalogClientResponse(response);
  }

  if (cacheClass === "versioned" && response.status === 200) {
    return withVersionedClientResponse(response);
  }

  return withCors(response);
}

function catalogClientFromCache(cached, targetPath) {
  return withCatalogClientResponse(withResolvedContentType(cached, targetPath));
}

function isCatalogNotFoundStatus(status) {
  return status === 404 || status === 410;
}

function shouldServeStaleCatalog(cacheClass, cached, status) {
  return cacheClass === "catalog" && Boolean(cached) && status !== 200 && !isCatalogNotFoundStatus(status);
}

async function readProxyCacheEntry(cache, cacheKey, cacheClass, hasConditionalHeaders, targetPath) {
  if (hasConditionalHeaders) {
    return { cached: undefined, freshResponse: null };
  }

  const matched = await cache.match(cacheKey);
  if (!matched) {
    return { cached: undefined, freshResponse: null };
  }

  if (cacheClass === "catalog") {
    const cachedAtMs = getCatalogCachedAtMs(matched);
    if (cachedAtMs !== null && isCatalogEdgeCacheFresh(cachedAtMs)) {
      return { cached: matched, freshResponse: catalogClientFromCache(matched, targetPath) };
    }

    return { cached: matched, freshResponse: null };
  }

  return {
    cached: matched,
    freshResponse: clientFileProxyResponse(withResolvedContentType(matched, targetPath), cacheClass),
  };
}

function storeSuccessfulFileProxyResponse(ctx, cache, cacheKey, cacheClass, response) {
  const stored = cacheClass === "catalog"
    ? buildCatalogStoredResponse(response.clone())
    : buildFileStoredResponse(withCors(response.clone()));
  ctx.waitUntil(cache.put(cacheKey, stored));
}

async function handleProxyRoute(target, env, request, ctx) {
  const cacheClass = classifyProxyCacheClass(target.targetPath);
  const upstreamRequest = buildUpstreamRequest(target, env, request.headers);
  const hasConditionalHeaders = requestHasConditionalHeaders(request.headers);
  const cache = caches.default;
  const cacheKey = new Request(upstreamRequest.url, { method: "GET" });
  const { cached, freshResponse } = await readProxyCacheEntry(
    cache,
    cacheKey,
    cacheClass,
    hasConditionalHeaders,
    target.targetPath,
  );

  if (freshResponse) {
    scheduleZipDownloadCount(ctx, env, target.targetPath, freshResponse.status);
    return freshResponse;
  }

  const upstreamFetchOptions = {
    method: "GET",
    headers: upstreamRequest.headers,
  };
  if (!hasConditionalHeaders) {
    upstreamFetchOptions.cf = { cacheEverything: true };
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamRequest.url, upstreamFetchOptions);
  } catch {
    if (cacheClass === "catalog" && cached) {
      return catalogClientFromCache(cached, target.targetPath);
    }

    return withCors(new Response("Bad Gateway", { status: 502 }));
  }

  if (shouldServeStaleCatalog(cacheClass, cached, upstreamResponse.status)) {
    return catalogClientFromCache(cached, target.targetPath);
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  let response = withResolvedContentType(new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  }), target.targetPath);

  if (upstreamResponse.status === 200) {
    storeSuccessfulFileProxyResponse(ctx, cache, cacheKey, cacheClass, response);
  }

  const clientResponse = clientFileProxyResponse(response, cacheClass);
  scheduleZipDownloadCount(ctx, env, target.targetPath, clientResponse.status);
  return clientResponse;
}

function finishProxyTargetResponse(target, env, request, ctx) {
  if (target.kind === "usage") {
    return usageResponse();
  }

  if (target.kind === "invalid_path") {
    return invalidPathResponse();
  }

  if (target.kind === "proxy" && isLegacyFlatPackagePath(target.targetPath)) {
    return legacyFlatPathResponse();
  }

  if (target.kind === "tags") {
    return handleTagsRoute(env, ctx);
  }

  if (target.kind === "proxy") {
    return handleProxyRoute(target, env, request, ctx);
  }

  return null;
}

async function handlePkgRouteRequest(requestUrl, env, request, ctx) {
  const pkgTarget = await resolvePkgRouteTarget(requestUrl, env, request.headers);

  if (pkgTarget.kind === "pkg_error") {
    return pkgErrorResponse(pkgTarget.payload, pkgTarget.status ?? 400);
  }

  const response = finishProxyTargetResponse(pkgTarget, env, request, ctx);
  if (response) {
    return response;
  }

  return pkgErrorResponse({
    error: "invalid_pkg_path",
    message: "Unsupported /pkg/ path shape.",
  }, 400);
}

async function handleStatsRouteRequest(normalizedPath, env) {
  const result = await resolveStatsResult(normalizedPath, env);
  const response = jsonResponse(result.payload, result.status);
  if (!result.cacheControl) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", result.cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleWorkerGet(request, env, ctx) {
  const requestUrl = new URL(request.url);
  const normalizedPath = normalizePath(requestUrl.pathname);
  if (normalizedPath !== null && (normalizedPath === "pkg" || normalizedPath.startsWith("pkg/"))) {
    return handlePkgRouteRequest(requestUrl, env, request, ctx);
  }

  if (normalizedPath !== null && (normalizedPath === "stats" || normalizedPath.startsWith("stats/"))) {
    return handleStatsRouteRequest(normalizedPath, env);
  }

  const target = getProxyTarget(requestUrl);
  const response = finishProxyTargetResponse(target, env, request, ctx);
  if (response) {
    return response;
  }

  return handleProxyRoute(target, env, request, ctx);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    if (request.method !== "GET") {
      return withCors(new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": CORS_ALLOW_METHODS },
      }));
    }

    return handleWorkerGet(request, env, ctx);
  },
};
