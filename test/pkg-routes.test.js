import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalPackagePath,
  isSafePackageVersion,
  parsePkgPath,
  resolvePkgProxyTarget,
} from "../src/pkg-routes.js";
import { normalizePath, normalizeRef } from "../src/worker.js";

test("parsePkgPath supports version-in-path agent instruction", () => {
  assert.deepEqual(
    parsePkgPath("pkg/agents-repo/hello-agent/1.0.0/agents/hello-agent.agent.md"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: "1.0.0",
      resourceKind: "agent",
      resourceId: "hello-agent.agent.md",
    },
  );
});

test("parsePkgPath supports version-in-path instructions.json", () => {
  assert.deepEqual(
    parsePkgPath("pkg/agents-repo/hello-agent/1.0.1/instructions.json"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: "1.0.1",
      resourceKind: "instructions",
      resourceId: "instructions.json",
    },
  );
});

test("parsePkgPath supports short alias agent and flow routes", () => {
  assert.deepEqual(
    parsePkgPath("pkg/agents-repo/hello-agent/agents/planner"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: null,
      resourceKind: "agent",
      resourceId: "planner",
    },
  );

  assert.deepEqual(
    parsePkgPath("pkg/agents-repo/hello-agent/flows/hello-agents"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: null,
      resourceKind: "flow",
      resourceId: "hello-agents",
    },
  );
});

test("parsePkgPath supports short alias instructions.json", () => {
  assert.deepEqual(
    parsePkgPath("pkg/agents-repo/hello-agent/instructions.json"),
    {
      namespace: "agents-repo",
      packageId: "hello-agent",
      version: null,
      resourceKind: "instructions",
      resourceId: "instructions.json",
    },
  );
});

test("parsePkgPath rejects non-pkg paths", () => {
  assert.equal(parsePkgPath("packages/agents-repo/hello-agent/versions/1.0.0/instructions.json"), null);
  assert.equal(parsePkgPath("pkg/agents-repo/hello-agent"), null);
});

test("buildCanonicalPackagePath appends .agent.md for bare ids", () => {
  assert.equal(
    buildCanonicalPackagePath("agents-repo", "hello-agent", "1.0.0", "flow", "hello-agents"),
    "packages/agents-repo/hello-agent/versions/1.0.0/flows/hello-agents.agent.md",
  );
});

test("resolvePkgProxyTarget rewrites version-in-path without manifest fetch", async () => {
  let manifestFetchCount = 0;
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/agents-repo/hello-agent/1.0.0/agents/hello-agent.agent.md?ref=v2.x"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async () => {
        manifestFetchCount += 1;
        return { ok: true, latest: "9.9.9" };
      },
    },
  );

  assert.deepEqual(target, {
    kind: "proxy",
    ref: "v2.x",
    targetPath: "packages/agents-repo/hello-agent/versions/1.0.0/agents/hello-agent.agent.md",
    fromPkgRoute: true,
  });
  assert.equal(manifestFetchCount, 0);
});

test("resolvePkgProxyTarget uses query version for short alias", async () => {
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/agents-repo/hello-agent/flows/hello-agents?ref=v2.x&version=1.0.0"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async () => ({ ok: false }),
    },
  );

  assert.deepEqual(target, {
    kind: "proxy",
    ref: "v2.x",
    targetPath: "packages/agents-repo/hello-agent/versions/1.0.0/flows/hello-agents.agent.md",
    fromPkgRoute: true,
  });
});

test("resolvePkgProxyTarget resolves latest from manifest when version omitted", async () => {
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/agents-repo/hello-agent/instructions.json?ref=main"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async (ref, manifestPath) => {
        assert.equal(ref, "main");
        assert.equal(manifestPath, "packages/agents-repo/hello-agent/versions/manifest.json");
        return { ok: true, latest: "1.0.1" };
      },
    },
  );

  assert.deepEqual(target, {
    kind: "proxy",
    ref: "main",
    targetPath: "packages/agents-repo/hello-agent/versions/1.0.1/instructions.json",
    fromPkgRoute: true,
  });
});

test("resolvePkgProxyTarget returns missing_ref without query ref", async () => {
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/agents-repo/hello-agent/instructions.json"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async () => ({ ok: true, latest: "1.0.0" }),
    },
  );

  assert.deepEqual(target, { kind: "missing_ref" });
});

test("resolvePkgProxyTarget rejects unsafe pkg paths", async () => {
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/%252e%252e/agents-repo/hello-agent/instructions.json?ref=main"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async () => ({ ok: true, latest: "1.0.0" }),
    },
  );

  assert.deepEqual(target, { kind: "invalid_path" });
});

test("resolvePkgProxyTarget surfaces manifest_unavailable", async () => {
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/agents-repo/hello-agent/instructions.json?ref=main"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async () => ({ ok: false, status: 404 }),
    },
  );

  assert.equal(target.kind, "pkg_error");
  assert.equal(target.status, 404);
  assert.equal(target.payload.error, "manifest_unavailable");
});

test("resolvePkgProxyTarget rejects traversal in version query", async () => {
  const target = await resolvePkgProxyTarget(
    new URL("https://worker.example/pkg/agents-repo/hello-agent/flows/hello-agents?ref=main&version=1.0.0/../../other"),
    {
      normalizePath,
      normalizeRef,
      fetchManifestLatest: async () => ({ ok: true, latest: "1.0.0" }),
    },
  );

  assert.equal(target.kind, "pkg_error");
  assert.equal(target.payload.error, "invalid_version");
});

test("parsePkgPath rejects unsafe version segment in path", () => {
  assert.equal(
    parsePkgPath("pkg/agents-repo/hello-agent/1.0.0%2f..%2fother/agents/hello.agent.md"),
    null,
  );
});

test("isSafePackageVersion accepts semver and rejects path injection", () => {
  assert.equal(isSafePackageVersion("1.0.0"), true);
  assert.equal(isSafePackageVersion("1.0.1"), true);
  assert.equal(isSafePackageVersion("1.0.0/../../other"), false);
  assert.equal(isSafePackageVersion(""), false);
});
