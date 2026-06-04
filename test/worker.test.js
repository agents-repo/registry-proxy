import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  buildContentsApiUrl,
  buildUpstreamRequest,
  buildUpstreamUrl,
  encodeRef,
  getProxyTarget,
  normalizePath,
  normalizeRef,
  splitPathStyle,
} from "../src/worker.js";

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

test("buildUpstreamRequest uses raw host without token and Contents API with token", () => {
  const target = { ref: "main", targetPath: "packages/index.json" };
  const expectedUserAgent = "registry-proxy-worker/0.1 (+https://github.com/agents-repo/registry-proxy)";

  const unauthenticated = buildUpstreamRequest(target, {}, new Headers({ Accept: "application/json" }));
  assert.equal(
    unauthenticated.url,
    "https://raw.githubusercontent.com/agents-repo/registry/main/packages/index.json",
  );
  assert.equal(unauthenticated.headers.get("Accept"), "application/json");
  assert.equal(unauthenticated.headers.get("User-Agent"), expectedUserAgent);
  assert.equal(unauthenticated.headers.has("Authorization"), false);

  const authenticated = buildUpstreamRequest(target, { GITHUB_TOKEN: "token-value" }, new Headers({ Accept: "application/json" }));
  assert.equal(
    authenticated.url,
    "https://api.github.com/repos/agents-repo/registry/contents/packages/index.json?ref=main",
  );
  assert.equal(authenticated.headers.get("Accept"), "application/vnd.github.raw");
  assert.equal(authenticated.headers.get("User-Agent"), expectedUserAgent);
  assert.equal(authenticated.headers.get("Authorization"), "Bearer token-value");
});

test("fetch rejects unsupported methods", async () => {
  const response = await worker.fetch(new Request("https://worker.example/main/packages/index.json", { method: "POST" }), {}, { waitUntil() {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
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
