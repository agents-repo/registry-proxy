const REPO_OWNER = "agents-repo";
const REPO_NAME = "registry";
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;
const CONTENTS_API_BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const KNOWN_CONTENT_ROOTS = ["packages"];
const MAX_PATH_DECODE_PASSES = 8;
const CORS_ALLOW_ORIGIN = "*";
const UPSTREAM_USER_AGENT = "registry-proxy-worker/0.1 (+https://github.com/agents-repo/registry-proxy)";

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

function usagePayload() {
  return {
    message: "Use this Worker to proxy files from agents-repo/registry by ref.",
    repository: `${REPO_OWNER}/${REPO_NAME}`,
    supported_formats: [
      "/<ref>/<path>",
      "/<path>?ref=<ref>",
    ],
    examples: [
      "/main/packages/index.json",
      "/packages/index.json?ref=main",
      "/packages/index.json?ref=release-2026-06",
      "/packages/index.json?ref=v1.0.0",
      "/packages/index.json?ref=d34db33fd34db33fd34db33fd34db33fd34db33f",
    ],
  };
}

function usageResponse() {
  return jsonResponse(usagePayload(), 200);
}

function missingRefResponse() {
  return jsonResponse({
    error: "missing_ref",
    message: "A ref is required. Use /<ref>/<path> or /<path>?ref=<ref>.",
    repository: `${REPO_OWNER}/${REPO_NAME}`,
    supported_formats: usagePayload().supported_formats,
    examples: usagePayload().examples,
  }, 400);
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

function normalizePath(pathname) {
  const normalizedPath = (pathname || "/").replace(/^\/+/, "");
  if (!normalizedPath) {
    return "";
  }

  if (containsPathTraversal(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

function normalizeRef(refValue) {
  const normalizedRef = String(refValue || "").replace(/^\/+|\/+$/g, "");
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
    return { kind: "missing_ref" };
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

  return { kind: "missing_ref" };
}

function encodeRef(ref) {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function buildUpstreamUrl(ref, targetPath) {
  const normalizedPath = targetPath.replace(/^\/+/, "");
  return `${RAW_BASE_URL}/${encodeRef(ref)}/${normalizedPath}`;
}

function buildContentsApiUrl(ref, targetPath) {
  const normalizedPath = targetPath.replace(/^\/+/, "");
  return `${CONTENTS_API_BASE_URL}/${normalizedPath}?ref=${encodeURIComponent(ref)}`;
}

function buildUpstreamRequest(target, env, requestHeaders) {
  const headers = new Headers();
  const requestAccept = requestHeaders.get("Accept") || "*/*";
  headers.set("User-Agent", UPSTREAM_USER_AGENT);

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
  buildContentsApiUrl,
  buildUpstreamRequest,
  buildUpstreamUrl,
  encodeRef,
  getProxyTarget,
  normalizePath,
  normalizeRef,
  splitPathStyle,
};

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") {
      return withCors(new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": "GET" },
      }));
    }

    const requestUrl = new URL(request.url);
    const target = getProxyTarget(requestUrl);

    if (target.kind === "usage") {
      return usageResponse();
    }

    if (target.kind === "missing_ref") {
      return missingRefResponse();
    }

    if (target.kind === "invalid_path") {
      return invalidPathResponse();
    }

    const upstreamRequest = buildUpstreamRequest(target, env, request.headers);
    const upstreamUrl = upstreamRequest.url;

    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return withCors(cached);
    }

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: "GET",
        headers: upstreamRequest.headers,
        cf: {
          cacheEverything: true,
        },
      });
    } catch {
      return withCors(new Response("Bad Gateway", { status: 502 }));
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    const response = new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
    const responseWithCors = withCors(response);

    if (upstreamResponse.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, responseWithCors.clone()));
    }

    return responseWithCors;
  },
};
