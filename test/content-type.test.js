import test from "node:test";
import assert from "node:assert/strict";
import {
  getExtension,
  resolveContentType,
  withResolvedContentType,
} from "../src/content-type.js";

test("getExtension returns lowercase final extension", () => {
  assert.equal(getExtension("agents/hello-agent.agent.md"), ".md");
  assert.equal(getExtension("packages/index.JSON"), ".json");
  assert.equal(getExtension("README.Md"), ".md");
  assert.equal(getExtension("file"), null);
  assert.equal(getExtension(".gitignore"), null);
});

test("resolveContentType maps known extensions over upstream types", () => {
  assert.equal(
    resolveContentType("hello.agent.md", "application/vnd.github.raw"),
    "text/plain; charset=utf-8",
  );
  assert.equal(
    resolveContentType("index.json", "text/plain"),
    "application/json; charset=utf-8",
  );
  assert.equal(
    resolveContentType("index.json", "application/vnd.github.raw"),
    "application/json; charset=utf-8",
  );
  assert.equal(
    resolveContentType("notes.txt", "application/vnd.github.raw"),
    "text/plain; charset=utf-8",
  );
  assert.equal(
    resolveContentType("archive.zip", "application/vnd.github.raw"),
    "application/zip",
  );
  assert.equal(
    resolveContentType("Doc.MD", "text/plain"),
    "text/plain; charset=utf-8",
  );
});

test("resolveContentType falls back safely for unknown extensions", () => {
  assert.equal(
    resolveContentType("blob.bin", "application/vnd.github.raw"),
    "application/octet-stream",
  );
  assert.equal(
    resolveContentType("blob.bin", "application/octet-stream"),
    null,
  );
  assert.equal(
    resolveContentType("blob.bin", "image/png"),
    null,
  );
});

test("withResolvedContentType rewrites 200 responses and preserves headers", async () => {
  const upstream = new Response("hello", {
    status: 200,
    headers: {
      "content-type": "application/vnd.github.raw",
      etag: '"abc"',
      "content-length": "5",
      "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
      "cache-control": "public, max-age=60",
    },
  });

  const rewritten = withResolvedContentType(upstream, "agents/hello.agent.md");
  assert.equal(rewritten.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(rewritten.headers.get("etag"), '"abc"');
  assert.equal(rewritten.headers.get("content-length"), "5");
  assert.equal(rewritten.headers.get("last-modified"), "Wed, 21 Oct 2015 07:28:00 GMT");
  assert.equal(rewritten.headers.get("cache-control"), "public, max-age=60");
  assert.equal(await rewritten.text(), "hello");
});

test("withResolvedContentType leaves non-200 responses unchanged", () => {
  const upstream = new Response("missing", {
    status: 404,
    headers: { "content-type": "application/vnd.github.raw" },
  });
  const result = withResolvedContentType(upstream, "agents/hello.agent.md");
  assert.equal(result.headers.get("content-type"), "application/vnd.github.raw");
});
