const AGENT_FILE_EXT = ".agent.md";
const INSTRUCTIONS_FILE = "instructions.json";
const AGENTS_DIR = "agents";
const FLOWS_DIR = "flows";
const PACKAGE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isSafePathSegment(segment) {
  return Boolean(segment) && segment !== "." && segment !== "..";
}

export function isSafePackageVersion(version) {
  if (!isSafePathSegment(version)) {
    return false;
  }

  if (version.includes("/") || version.includes("\\")) {
    return false;
  }

  return PACKAGE_VERSION_PATTERN.test(version);
}

function isShortAliasResourceSegment(segment) {
  return segment === AGENTS_DIR || segment === FLOWS_DIR || segment === INSTRUCTIONS_FILE;
}

/**
 * @param {string} normalizedPath - Path without leading slashes (from normalizePath).
 * @returns {null | { namespace: string, packageId: string, version: string | null, resourceKind: 'instructions' | 'agent' | 'flow', resourceId: string }}
 */
export function parsePkgPath(normalizedPath) {
  if (!normalizedPath || !normalizedPath.startsWith("pkg/")) {
    return null;
  }

  const segments = normalizedPath.slice("pkg/".length).split("/").filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const [namespace, packageId, third, fourth, fifth] = segments;

  if (!isSafePathSegment(namespace) || !isSafePathSegment(packageId)) {
    return null;
  }

  if (!namespace || !packageId) {
    return null;
  }

  if (isShortAliasResourceSegment(third)) {
    if (third === INSTRUCTIONS_FILE) {
      if (segments.length !== 3) {
        return null;
      }

      return {
        namespace,
        packageId,
        version: null,
        resourceKind: "instructions",
        resourceId: INSTRUCTIONS_FILE,
      };
    }

    if (segments.length !== 4 || !fourth) {
      return null;
    }

    if (!isSafePathSegment(fourth)) {
      return null;
    }

    return {
      namespace,
      packageId,
      version: null,
      resourceKind: third === AGENTS_DIR ? "agent" : "flow",
      resourceId: fourth,
    };
  }

  const version = third;
  const resourceSegment = fourth;

  if (!version || !resourceSegment) {
    return null;
  }

  if (!isSafePackageVersion(version)) {
    return null;
  }

  if (!isSafePathSegment(resourceSegment)) {
    return null;
  }

  if (resourceSegment === INSTRUCTIONS_FILE) {
    if (segments.length !== 4) {
      return null;
    }

    return {
      namespace,
      packageId,
      version,
      resourceKind: "instructions",
      resourceId: INSTRUCTIONS_FILE,
    };
  }

  if (resourceSegment !== AGENTS_DIR && resourceSegment !== FLOWS_DIR) {
    return null;
  }

  if (segments.length !== 5 || !fifth) {
    return null;
  }

  if (!isSafePathSegment(fifth)) {
    return null;
  }

  return {
    namespace,
    packageId,
    version,
    resourceKind: resourceSegment === AGENTS_DIR ? "agent" : "flow",
    resourceId: fifth,
  };
}

function ensureAgentMarkdownFilename(resourceId) {
  if (resourceId.endsWith(AGENT_FILE_EXT)) {
    return resourceId;
  }

  return `${resourceId}${AGENT_FILE_EXT}`;
}

/**
 * @param {string} namespace
 * @param {string} packageId
 * @param {string} version
 * @param {'instructions' | 'agent' | 'flow'} resourceKind
 * @param {string} resourceId
 * @returns {string}
 */
export function buildCanonicalPackagePath(namespace, packageId, version, resourceKind, resourceId) {
  const base = `packages/${namespace}/${packageId}/versions/${version}`;

  if (resourceKind === "instructions") {
    return `${base}/${INSTRUCTIONS_FILE}`;
  }

  const dir = resourceKind === "agent" ? AGENTS_DIR : FLOWS_DIR;
  const filename = ensureAgentMarkdownFilename(resourceId);
  return `${base}/${dir}/${filename}`;
}

function manifestPathForPackage(namespace, packageId) {
  return `packages/${namespace}/${packageId}/versions/manifest.json`;
}

function jsonResponsePayload(error, message, extra = {}) {
  return {
    kind: "pkg_error",
    error,
    message,
    ...extra,
  };
}

/**
 * @param {URL} requestUrl
 * @param {{
 *   normalizePath: (pathname: string) => string | null,
 *   normalizeRef: (refValue: string) => string | null,
 *   fetchManifestLatest: (ref: string, manifestPath: string) => Promise<{ ok: true, latest: string } | { ok: false, status?: number }>,
 * }} deps
 */
export async function resolvePkgProxyTarget(requestUrl, deps) {
  const { normalizePath, normalizeRef, fetchManifestLatest } = deps;
  const path = normalizePath(requestUrl.pathname);
  if (path === null) {
    return { kind: "invalid_path" };
  }

  const parsed = parsePkgPath(path);
  if (!parsed) {
    if (path === "pkg" || path.startsWith("pkg/")) {
      return {
        kind: "pkg_error",
        status: 400,
        payload: jsonResponsePayload("invalid_pkg_path", "Unsupported /pkg/ path shape."),
      };
    }

    return null;
  }

  const queryRef = requestUrl.searchParams.get("ref");
  if (queryRef === null) {
    return { kind: "missing_ref" };
  }

  const ref = normalizeRef(queryRef);
  if (!ref) {
    return { kind: "invalid_path" };
  }

  let version = parsed.version;
  if (!version) {
    const queryVersion = requestUrl.searchParams.get("version");
    if (queryVersion !== null) {
      const normalizedVersion = String(queryVersion).trim();
      if (!isSafePackageVersion(normalizedVersion)) {
        return {
          kind: "pkg_error",
          status: 400,
          payload: jsonResponsePayload("invalid_version", "Query parameter version must be a valid semver."),
        };
      }
      version = normalizedVersion;
    }
  }

  if (!version) {
    const manifestPath = manifestPathForPackage(parsed.namespace, parsed.packageId);
    const manifestResult = await fetchManifestLatest(ref, manifestPath);
    if (!manifestResult.ok) {
      const status = manifestResult.status && manifestResult.status >= 400 && manifestResult.status < 500
        ? manifestResult.status
        : 502;
      return {
        kind: "pkg_error",
        status,
        payload: jsonResponsePayload(
          "manifest_unavailable",
          "Could not resolve package version from versions/manifest.json latest.",
          { manifestPath, ref },
        ),
      };
    }

    version = manifestResult.latest;
  }

  if (!isSafePackageVersion(version)) {
    return {
      kind: "pkg_error",
      status: 400,
      payload: jsonResponsePayload("invalid_version", "Resolved package version must be a valid semver."),
    };
  }

  const targetPath = buildCanonicalPackagePath(
    parsed.namespace,
    parsed.packageId,
    version,
    parsed.resourceKind,
    parsed.resourceId,
  );

  return {
    kind: "proxy",
    ref,
    targetPath,
    fromPkgRoute: true,
  };
}

export {
  AGENT_FILE_EXT,
  AGENTS_DIR,
  FLOWS_DIR,
  INSTRUCTIONS_FILE,
  manifestPathForPackage,
};
