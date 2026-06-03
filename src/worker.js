const REPO_OWNER = "agents-repo";
const REPO_NAME = "registry";
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;
const KNOWN_CONTENT_ROOTS = ["packages"];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
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

  for (let index = 0; index <= 2; index += 1) {
    if (hasUnsafePathSegments(currentValue)) {
      return true;
    }

    const decodedValue = decodePathValue(currentValue);
    if (decodedValue === currentValue) {
      break;
    }

    currentValue = decodedValue;
  }

  return false;
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

    return {
      kind: "proxy",
      ref: normalizedRef,
      targetPath: path,
    };
  }

  for (const root of KNOWN_CONTENT_ROOTS) {
    if (path === root || path.startsWith(`${root}/`)) {
      return { kind: "missing_ref" };
    }
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

export {
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
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": "GET" },
      });
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

    const upstreamUrl = buildUpstreamUrl(target.ref, target.targetPath);

    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const upstreamHeaders = new Headers();
    upstreamHeaders.set("Accept", request.headers.get("Accept") || "*/*");

    if (env.GITHUB_TOKEN) {
      upstreamHeaders.set("Authorization", `token ${env.GITHUB_TOKEN}`);
    }

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: "GET",
        headers: upstreamHeaders,
        cf: {
          cacheEverything: true,
        },
      });
    } catch {
      return new Response("Bad Gateway", { status: 502 });
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    const response = new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });

    if (upstreamResponse.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
