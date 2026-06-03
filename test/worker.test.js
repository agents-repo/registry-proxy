import test from "node:test";
import assert from "node:assert/strict";
import worker, {
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

test("fetch rejects unsupported methods", async () => {
  const response = await worker.fetch(new Request("https://worker.example/main/packages/index.json", { method: "POST" }), {}, { waitUntil() {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
});

test("fetch returns usage and missing_ref responses", async () => {
  const ctx = { waitUntil() {} };

  const usage = await worker.fetch(new Request("https://worker.example/main"), {}, ctx);
  assert.equal(usage.status, 200);
  const usageBody = await usage.json();
  assert.equal(usageBody.repository, "agents-repo/registry");

  const missingRef = await worker.fetch(new Request("https://worker.example/packages/index.json"), {}, ctx);
  assert.equal(missingRef.status, 400);
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
  } finally {
    globalThis.caches = originalCaches;
    globalThis.fetch = originalFetch;
  }
});
