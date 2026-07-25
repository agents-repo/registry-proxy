import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  buildContentsApiUrl,
  buildTagsApiUrl,
  buildTagsListingResponse,
  buildUpstreamRequest,
  buildUpstreamUrl,
  encodeRef,
  getProxyTarget,
  isLegacyFlatPackagePath,
  isTagsEdgeCacheFresh,
  normalizePath,
  normalizeRef,
  splitPathStyle,
  TAGS_API_BASE_URL,
  TAGS_CACHED_AT_HEADER,
  TAGS_EDGE_TTL_SECONDS,
  UPSTREAM_USER_AGENT,
} from "../src/worker.js";

test("getProxyTarget resolves tags listing route", () => {
  assert.deepEqual(getProxyTarget(new URL("https://worker.example/tags")), { kind: "tags" });
  assert.deepEqual(getProxyTarget(new URL("https://worker.example/tags/")), { kind: "tags" });
});

test("getProxyTarget keeps path-style file proxy for ref/tags paths", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/tags")),
    { kind: "proxy", ref: "main", targetPath: "tags" },
  );
});

test("buildTagsApiUrl targets GitHub tags API with pagination", () => {
  assert.equal(
    buildTagsApiUrl(1),
    `${TAGS_API_BASE_URL}?per_page=100&page=1`,
  );
  assert.equal(
    buildTagsApiUrl(2),
    `${TAGS_API_BASE_URL}?per_page=100&page=2`,
  );
});

test("fetch returns tags listing with CORS and pagination", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.caches = {
      default: {
        async match() {
          return undefined;
        },
        async put() {},
      },
    };

    let fetchCount = 0;
    globalThis.fetch = async (url) => {
      fetchCount += 1;

      const page = new URL(String(url)).searchParams.get("page");
      if (page === "1") {
        return new Response(JSON.stringify([{ name: "v1.2.0" }, { name: "v1.1.0" }]), {
          status: 200,
          headers: {
            "content-type": "application/json",
            Link: `<${TAGS_API_BASE_URL}?per_page=100&page=2>; rel="next"`,
          },
        });
      }

      return new Response(JSON.stringify([{ name: "v1.0.0" }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    };

    const response = await worker.fetch(new Request("https://worker.example/tags"), {}, { waitUntil() {} });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("Cache-Control"), `public, max-age=${TAGS_EDGE_TTL_SECONDS}`);
    assert.match(response.headers.get(TAGS_CACHED_AT_HEADER) ?? "", /^\d+$/);
    assert.deepEqual(await response.json(), [
      { name: "v1.2.0" },
      { name: "v1.1.0" },
      { name: "v1.0.0" },
    ]);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch caches tags listing on success", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    const cacheStore = new Map();
    const cacheWrites = [];
    let fetchCount = 0;

    globalThis.caches = {
      default: {
        async match(request) {
          return cacheStore.get(request.url);
        },
        async put(request, response) {
          cacheWrites.push(request.url);
          cacheStore.set(request.url, response);
        },
      },
    };

    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify([{ name: "v1.2.0" }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    };

    const waitUntilPromises = [];
    const ctx = {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    };

    const request = new Request("https://worker.example/tags");
    const firstResponse = await worker.fetch(request, {}, ctx);
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), [{ name: "v1.2.0" }]);
    assert.equal(fetchCount, 1);
    await Promise.all(waitUntilPromises);
    assert.equal(cacheWrites.length, 1);

    const secondResponse = await worker.fetch(request, {}, ctx);
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(await secondResponse.json(), [{ name: "v1.2.0" }]);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch re-fetches tags listing after edge TTL expires", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    const cacheStore = new Map();
    let fetchCount = 0;

    globalThis.caches = {
      default: {
        async match(request) {
          return cacheStore.get(request.url);
        },
        async put(request, response) {
          cacheStore.set(request.url, response);
        },
      },
    };

    globalThis.fetch = async () => {
      fetchCount += 1;
      const tagName = fetchCount === 1 ? "v1.2.0" : "v1.3.0";
      return new Response(JSON.stringify([{ name: tagName }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    };

    const waitUntilPromises = [];
    const ctx = {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    };

    const request = new Request("https://worker.example/tags");
    const firstResponse = await worker.fetch(request, {}, ctx);
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), [{ name: "v1.2.0" }]);
    assert.equal(fetchCount, 1);
    await Promise.all(waitUntilPromises);

    const staleCachedAtMs = Date.now() - (TAGS_EDGE_TTL_SECONDS + 1) * 1000;
    const staleResponse = buildTagsListingResponse([{ name: "v1.2.0" }], staleCachedAtMs);
    const cacheKeyUrl = `${TAGS_API_BASE_URL}?per_page=100`;
    cacheStore.set(cacheKeyUrl, staleResponse);

    const secondResponse = await worker.fetch(request, {}, { waitUntil() {} });
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(await secondResponse.json(), [{ name: "v1.3.0" }]);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("isTagsEdgeCacheFresh respects TTL boundary", () => {
  const nowMs = 1_700_000_000_000;
  assert.equal(isTagsEdgeCacheFresh(nowMs, nowMs), true);
  assert.equal(isTagsEdgeCacheFresh(nowMs - TAGS_EDGE_TTL_SECONDS * 1000, nowMs), true);
  assert.equal(isTagsEdgeCacheFresh(nowMs - (TAGS_EDGE_TTL_SECONDS * 1000 + 1), nowMs), false);
});

test("fetch preserves upstream tags API errors", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.caches = {
      default: {
        async match() {
          return undefined;
        },
        async put() {},
      },
    };

    globalThis.fetch = async () => new Response('{"message":"rate limit"}', {
      status: 403,
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await worker.fetch(new Request("https://worker.example/tags"), {}, { waitUntil() {} });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await response.text(), '{"message":"rate limit"}');
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("isLegacyFlatPackagePath rejects flat package paths", () => {
  assert.equal(isLegacyFlatPackagePath("packages/hello-agent/versions/1.0.0/1.0.0-cursor.zip"), true);
  assert.equal(isLegacyFlatPackagePath("packages/hello-agent"), true);
  assert.equal(isLegacyFlatPackagePath("packages/index.json"), false);
  assert.equal(isLegacyFlatPackagePath("packages/tree.json"), false);
  assert.equal(
    isLegacyFlatPackagePath("packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip"),
    false,
  );
});

test("getProxyTarget allows namespaced package paths", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip")),
    {
      kind: "proxy",
      ref: "main",
      targetPath: "packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip",
    },
  );
});

test("buildUpstreamUrl preserves namespaced package paths", () => {
  assert.equal(
    buildUpstreamUrl("v2.x", "packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip"),
    "https://raw.githubusercontent.com/agents-repo/registry/v2.x/packages/agents-repo/hello-agent/versions/1.0.0/1.0.0-cursor.zip",
  );
});

test("fetch rejects legacy flat package paths with 400", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/main/packages/hello-agent/versions/1.0.0/1.0.0-cursor.zip"),
    {},
    { waitUntil() {} },
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "legacy_flat_path_not_supported");
});

test("normalizePath removes only leading slashes", () => {
  assert.equal(normalizePath("///main/packages/index.json"), "main/packages/index.json");
  assert.equal(normalizePath("/"), "");
  assert.equal(normalizePath(""), "");
});

test("normalizePath rejects traversal segments including encoded variants", () => {
  assert.equal(normalizePath("/../packages/index.json"), null);
  assert.equal(normalizePath("/%2e%2e/packages/index.json"), null);
  assert.equal(normalizePath("/%252e%252e/packages/index.json"), null);
  assert.equal(normalizePath("/packages/../index.json"), null);
});

test("normalizeRef trims boundary slashes and rejects traversal", () => {
  assert.equal(normalizeRef("/main/"), "main");
  assert.equal(normalizeRef("../main"), null);
  assert.equal(normalizeRef("%2e%2e/main"), null);
  assert.equal(normalizeRef("%252e%252e/main"), null);
  assert.equal(normalizeRef("%2525252e%2525252e/main"), null);
});

test("splitPathStyle parses ref and target path", () => {
  assert.deepEqual(splitPathStyle("main/packages/index.json"), {
    ref: "main",
    targetPath: "packages/index.json",
  });
  assert.equal(splitPathStyle("main"), null);
  assert.equal(splitPathStyle("main/"), null);
});

test("getProxyTarget resolves guidance routes", () => {
  assert.deepEqual(getProxyTarget(new URL("https://worker.example/")), { kind: "usage" });
  assert.deepEqual(getProxyTarget(new URL("https://worker.example/main")), { kind: "usage" });
  assert.deepEqual(getProxyTarget(new URL("https://worker.example/main/")), { kind: "usage" });
});

test("getProxyTarget supports both path and query formats", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/packages/index.json")),
    { kind: "proxy", ref: "main", targetPath: "packages/index.json" },
  );

  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/packages/index.json?ref=v1.2.3")),
    { kind: "proxy", ref: "v1.2.3", targetPath: "packages/index.json" },
  );
});

test("getProxyTarget applies query-ref precedence when both are present", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/packages/index.json?ref=other")),
    { kind: "proxy", ref: "other", targetPath: "packages/index.json" },
  );

  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/packages/index.json?ref=/other/")),
    { kind: "proxy", ref: "other", targetPath: "packages/index.json" },
  );
});

test("getProxyTarget keeps full path when mixed format does not map to a known content root", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/README.md?ref=other")),
    { kind: "proxy", ref: "other", targetPath: "main/README.md" },
  );
});

test("getProxyTarget returns missing_ref when no ref can be inferred", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/packages/index.json")),
    { kind: "missing_ref" },
  );
});

test("getProxyTarget rejects unsafe traversal paths", () => {
  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/main/%252e%252e/packages/index.json")),
    { kind: "invalid_path" },
  );

  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/%252e%252e/packages/index.json?ref=main")),
    { kind: "invalid_path" },
  );

  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/packages/index.json?ref=../other-repo/main")),
    { kind: "invalid_path" },
  );

  assert.deepEqual(
    getProxyTarget(new URL("https://worker.example/packages/index.json?ref=%252e%252e/other-repo/main")),
    { kind: "invalid_path" },
  );
});

test("encodeRef preserves slash-separated branch segments", () => {
  assert.equal(encodeRef("feature/my-branch"), "feature/my-branch");
  assert.equal(encodeRef("release candidate"), "release%20candidate");
});

test("buildUpstreamUrl always targets agents-repo/registry", () => {
  assert.equal(
    buildUpstreamUrl("main", "packages/index.json"),
    "https://raw.githubusercontent.com/agents-repo/registry/main/packages/index.json",
  );
  assert.equal(
    buildUpstreamUrl("feature/my-branch", "/packages/index.json"),
    "https://raw.githubusercontent.com/agents-repo/registry/feature/my-branch/packages/index.json",
  );
});

test("buildContentsApiUrl targets GitHub Contents API with ref query", () => {
  assert.equal(
    buildContentsApiUrl("main", "packages/index.json"),
    "https://api.github.com/repos/agents-repo/registry/contents/packages/index.json?ref=main",
  );
  assert.equal(
    buildContentsApiUrl("feature/my-branch", "/packages/index.json"),
    "https://api.github.com/repos/agents-repo/registry/contents/packages/index.json?ref=feature%2Fmy-branch",
  );
});

test("buildUpstreamRequest forwards conditional request headers", () => {
  const target = { ref: "main", targetPath: "packages/index.json" };
  const requestHeaders = new Headers({
    Accept: "application/json",
    "If-None-Match": '"etag-value"',
    "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT",
  });

  const upstream = buildUpstreamRequest(target, {}, requestHeaders);

  assert.equal(upstream.headers.get("If-None-Match"), '"etag-value"');
  assert.equal(upstream.headers.get("If-Modified-Since"), "Wed, 21 Oct 2015 07:28:00 GMT");
});

test("buildUpstreamRequest uses raw host without token and Contents API with token", () => {
  const target = { ref: "main", targetPath: "packages/index.json" };

  const unauthenticated = buildUpstreamRequest(target, {}, new Headers({ Accept: "application/json" }));
  assert.equal(
    unauthenticated.url,
    "https://raw.githubusercontent.com/agents-repo/registry/main/packages/index.json",
  );
  assert.equal(unauthenticated.headers.get("Accept"), "application/json");
  assert.equal(unauthenticated.headers.get("User-Agent"), UPSTREAM_USER_AGENT);
  assert.equal(unauthenticated.headers.has("Authorization"), false);

  const authenticated = buildUpstreamRequest(target, { GITHUB_TOKEN: "token-value" }, new Headers({ Accept: "application/json" }));
  assert.equal(
    authenticated.url,
    "https://api.github.com/repos/agents-repo/registry/contents/packages/index.json?ref=main",
  );
  assert.equal(authenticated.headers.get("Accept"), "application/vnd.github.raw");
  assert.equal(authenticated.headers.get("User-Agent"), UPSTREAM_USER_AGENT);
  assert.equal(authenticated.headers.get("Authorization"), "Bearer token-value");
});

test("fetch handles CORS preflight with OPTIONS", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/packages/index.json?ref=v1.2.0", { method: "OPTIONS" }),
    {},
    { waitUntil() {} },
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  assert.equal(
    response.headers.get("Access-Control-Allow-Headers"),
    "Accept, If-None-Match, If-Modified-Since",
  );
  assert.equal(response.headers.get("Access-Control-Max-Age"), "86400");
});

test("fetch rejects unsupported methods", async () => {
  const response = await worker.fetch(new Request("https://worker.example/main/packages/index.json", { method: "POST" }), {}, { waitUntil() {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("fetch returns usage and missing_ref responses", async () => {
  const ctx = { waitUntil() {} };

  const usage = await worker.fetch(new Request("https://worker.example/main"), {}, ctx);
  assert.equal(usage.status, 200);
  assert.equal(usage.headers.get("Access-Control-Allow-Origin"), "*");
  const usageBody = await usage.json();
  assert.equal(usageBody.repository, "agents-repo/registry");

  const missingRef = await worker.fetch(new Request("https://worker.example/packages/index.json"), {}, ctx);
  assert.equal(missingRef.status, 400);
  assert.equal(missingRef.headers.get("Access-Control-Allow-Origin"), "*");
  const missingRefBody = await missingRef.json();
  assert.equal(missingRefBody.error, "missing_ref");
});

test("fetch returns invalid_path for unsafe inputs", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/packages/index.json?ref=%252e%252e/other/main"),
    {},
    { waitUntil() {} },
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await response.json();
  assert.equal(body.error, "invalid_path");
});

test("fetch returns cached response when cache key exists", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    const cachedResponse = new Response("cached", { status: 200 });
    globalThis.caches = {
      default: {
        async match() {
          return cachedResponse;
        },
        async put() {},
      },
    };

    globalThis.fetch = async () => {
      throw new Error("fetch should not be called on cache hit");
    };

    const response = await worker.fetch(new Request("https://worker.example/main/packages/index.json"), {}, { waitUntil() {} });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await response.text(), "cached");
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch returns 502 when upstream fetch throws", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.caches = {
      default: {
        async match() {
          return undefined;
        },
        async put() {},
      },
    };

    globalThis.fetch = async () => {
      throw new Error("network error");
    };

    const response = await worker.fetch(new Request("https://worker.example/main/packages/index.json"), {}, { waitUntil() {} });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch caches upstream 200 on miss and serves subsequent hit", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    const cacheStore = new Map();
    const cacheWrites = [];
    let fetchCount = 0;

    globalThis.caches = {
      default: {
        async match(request) {
          return cacheStore.get(request.url);
        },
        async put(request, response) {
          cacheWrites.push(request.url);
          cacheStore.set(request.url, response);
        },
      },
    };

    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response("upstream", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    };

    const waitUntilPromises = [];
    const ctx = {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    };

    const request = new Request("https://worker.example/main/packages/index.json");

    const firstResponse = await worker.fetch(request, {}, ctx);
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await firstResponse.text(), "upstream");
    assert.equal(fetchCount, 1);
    assert.equal(waitUntilPromises.length, 1);
    await Promise.all(waitUntilPromises);
    assert.equal(cacheWrites.length, 1);

    const secondResponse = await worker.fetch(request, {}, ctx);
    assert.equal(secondResponse.status, 200);
    assert.equal(secondResponse.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await secondResponse.text(), "upstream");
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch preserves upstream 403 while adding CORS header", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.caches = {
      default: {
        async match() {
          return undefined;
        },
        async put() {},
      },
    };

    globalThis.fetch = async () => new Response("forbidden", { status: 403 });

    const response = await worker.fetch(new Request("https://worker.example/main/packages/index.json"), {}, { waitUntil() {} });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await response.text(), "forbidden");
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch bypasses edge cache read and forwards conditional headers to upstream", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    let fetchCount = 0;
    let upstreamIfNoneMatch = null;
    let upstreamFetchCacheEverything = null;
    let cachePutCount = 0;

    globalThis.caches = {
      default: {
        async match() {
          return new Response("cached", { status: 200 });
        },
        async put() {
          cachePutCount += 1;
        },
      },
    };

    globalThis.fetch = async (_url, init) => {
      fetchCount += 1;
      upstreamIfNoneMatch = init?.headers?.get("If-None-Match") ?? null;
      upstreamFetchCacheEverything = init?.cf?.cacheEverything ?? null;
      return new Response(null, { status: 304 });
    };

    const response = await worker.fetch(
      new Request("https://worker.example/packages/index.json?ref=v1.2.0", {
        headers: {
          "If-None-Match": '"etag-value"',
        },
      }),
      {},
      { waitUntil() {} },
    );

    assert.equal(response.status, 304);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(fetchCount, 1);
    assert.equal(upstreamIfNoneMatch, '"etag-value"');
    assert.equal(upstreamFetchCacheEverything, null);
    assert.equal(cachePutCount, 0);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});

test("fetch updates edge cache when conditional request receives fresh upstream 200", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;

  try {
    const cacheStore = new Map();
    const cacheWrites = [];
    let fetchCount = 0;
    const fetchCacheEverythingValues = [];

    globalThis.caches = {
      default: {
        async match(request) {
          return cacheStore.get(request.url);
        },
        async put(request, response) {
          cacheWrites.push(request.url);
          cacheStore.set(request.url, response);
        },
      },
    };

    globalThis.fetch = async (_url, init) => {
      fetchCount += 1;
      fetchCacheEverythingValues.push(init?.cf?.cacheEverything ?? null);
      const ifNoneMatch = init?.headers?.get("If-None-Match") ?? null;
      if (ifNoneMatch === '"stale-etag"') {
        return new Response("fresh", {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            etag: '"fresh-etag"',
          },
        });
      }
      return new Response("stale", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    };

    const waitUntilPromises = [];
    const ctx = {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    };

    const url = "https://worker.example/main/packages/index.json";
    const unconditionalRequest = new Request(url);

    const staleResponse = await worker.fetch(unconditionalRequest, {}, ctx);
    assert.equal(await staleResponse.text(), "stale");
    assert.equal(fetchCount, 1);
    assert.deepEqual(fetchCacheEverythingValues, [true]);
    await Promise.all(waitUntilPromises);
    assert.equal(cacheWrites.length, 1);

    const conditionalResponse = await worker.fetch(
      new Request(url, {
        headers: {
          "If-None-Match": '"stale-etag"',
        },
      }),
      {},
      ctx,
    );
    assert.equal(conditionalResponse.status, 200);
    assert.equal(await conditionalResponse.text(), "fresh");
    assert.equal(fetchCount, 2);
    assert.deepEqual(fetchCacheEverythingValues, [true, null]);
    await Promise.all(waitUntilPromises);
    assert.equal(cacheWrites.length, 2);

    const cachedResponse = await worker.fetch(unconditionalRequest, {}, ctx);
    assert.equal(await cachedResponse.text(), "fresh");
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});
