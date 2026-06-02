const DEFAULT_UPSTREAM_BASE_URL = "https://raw.githubusercontent.com/agents-repo/registry/main";

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "";
  }

  // Keep intentional internal double slashes, but trim the leading slash for join logic.
  return pathname.replace(/^\/+/, "");
}

function buildUpstreamUrl(requestUrl, upstreamBaseUrl) {
  const path = normalizePath(requestUrl.pathname);
  if (!path) {
    return null;
  }

  const base = upstreamBaseUrl.replace(/\/$/, "");
  return `${base}/${path}`;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": "GET" },
      });
    }

    const requestUrl = new URL(request.url);
    const upstreamBaseUrl = env.UPSTREAM_BASE_URL || DEFAULT_UPSTREAM_BASE_URL;
    const upstreamUrl = buildUpstreamUrl(requestUrl, upstreamBaseUrl);

    if (!upstreamUrl) {
      return new Response("Not Found", { status: 404 });
    }

    const cache = caches.default;
    const cacheKey = new Request(requestUrl.toString(), { method: "GET" });
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
    } catch (error) {
      return new Response("Bad Gateway", { status: 502 });
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    const response = new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });

    if (upstreamResponse.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
