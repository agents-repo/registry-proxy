const AGENT_FILE_EXT = ".agent.md";
const INSTRUCTIONS_FILE = "instructions.json";
const AGENTS_DIR = "agents";
const FLOWS_DIR = "flows";
const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function segmentContainsPathSeparatorEncoding(segment) {
  return /%2[fF]|%5[cC]/.test(segment);
}

function isSafePathSegment(segment) {
  if (!segment || segment === "." || segment === "..") {
    return false;
  }

  if (segment.includes("/") || segment.includes("\\")) {
    return false;
  }

  return !segmentContainsPathSeparatorEncoding(segment);
}

export function isSafePackageVersion(version) {
  if (!isSafePathSegment(version)) {
    return false;
  }

  if (version.includes("/") || version.includes("\\") || segmentContainsPathSeparatorEncoding(version)) {
    return false;
  }

  return PACKAGE_VERSION_PATTERN.test(version);
}

function isShortAliasResourceSegment(segment) {
  return segment === AGENTS_DIR || segment === FLOWS_DIR || segment === INSTRUCTIONS_FILE;
}

function pkgParsed(namespace, packageId, version, resourceKind, resourceId) {
  return { namespace, packageId, version, resourceKind, resourceId };
}

function parseShortAliasPkgSegments(segments, namespace, packageId, third, fourth) {
  if (third === INSTRUCTIONS_FILE) {
    if (segments.length !== 3) {
      return null;
    }

    return pkgParsed(namespace, packageId, null, "instructions", INSTRUCTIONS_FILE);
  }

  if (segments.length !== 4 || !fourth || !isSafePathSegment(fourth)) {
    return null;
  }

  return pkgParsed(
    namespace,
    packageId,
    null,
    third === AGENTS_DIR ? "agent" : "flow",
    fourth,
  );
}

function parseVersionedPkgSegments(segments, namespace, packageId, version, resourceSegment, fifth) {
  if (!version || !resourceSegment) {
    return null;
  }

  if (!isSafePackageVersion(version) || !isSafePathSegment(resourceSegment)) {
    return null;
  }

  if (resourceSegment === INSTRUCTIONS_FILE) {
    if (segments.length !== 4) {
      return null;
    }

    return pkgParsed(namespace, packageId, version, "instructions", INSTRUCTIONS_FILE);
  }

  if (resourceSegment !== AGENTS_DIR && resourceSegment !== FLOWS_DIR) {
    return null;
  }

  if (segments.length !== 5 || !fifth || !isSafePathSegment(fifth)) {
    return null;
  }

  return pkgParsed(
    namespace,
    packageId,
    version,
    resourceSegment === AGENTS_DIR ? "agent" : "flow",
    fifth,
  );
}

/**
 * @param {string} normalizedPath - Path without leading slashes (from normalizePath).
 * @returns {null | { namespace: string, packageId: string, version: string | null, resourceKind: 'instructions' | 'agent' | 'flow', resourceId: string }}
 */
export function parsePkgPath(normalizedPath) {
  if (!normalizedPath?.startsWith("pkg/")) {
    return null;
  }

  const segments = normalizedPath.slice("pkg/".length).split("/").filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const [namespace, packageId, third, fourth, fifth] = segments;

  if (!namespace || !packageId || !isSafePathSegment(namespace) || !isSafePathSegment(packageId)) {
    return null;
  }

  if (isShortAliasResourceSegment(third)) {
    return parseShortAliasPkgSegments(segments, namespace, packageId, third, fourth);
  }

  return parseVersionedPkgSegments(segments, namespace, packageId, third, fourth, fifth);
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

function invalidPkgPathResult() {
  return {
    kind: "pkg_error",
    status: 400,
    payload: jsonResponsePayload("invalid_pkg_path", "Unsupported /pkg/ path shape."),
  };
}

function invalidVersionResult(message) {
  return {
    kind: "pkg_error",
    status: 400,
    payload: jsonResponsePayload("invalid_version", message),
  };
}

function manifestUnavailableResult(manifestPath, ref, manifestStatus) {
  const status = manifestStatus && manifestStatus >= 400 && manifestStatus < 500
    ? manifestStatus
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

function versionFromQueryParameter(requestUrl) {
  const queryVersion = requestUrl.searchParams.get("version");
  if (queryVersion === null) {
    return { ok: true, version: null };
  }

  const normalizedVersion = String(queryVersion).trim();
  if (!isSafePackageVersion(normalizedVersion)) {
    return {
      ok: false,
      result: invalidVersionResult("Query parameter version must be a valid semver."),
    };
  }

  return { ok: true, version: normalizedVersion };
}

async function versionFromManifest(parsed, ref, fetchManifestLatest) {
  const manifestPath = manifestPathForPackage(parsed.namespace, parsed.packageId);
  const manifestResult = await fetchManifestLatest(ref, manifestPath);
  if (!manifestResult.ok) {
    return {
      ok: false,
      result: manifestUnavailableResult(manifestPath, ref, manifestResult.status),
    };
  }

  return { ok: true, version: manifestResult.latest };
}

async function resolveEffectivePackageVersion(parsed, requestUrl, ref, fetchManifestLatest) {
  if (parsed.version) {
    return { ok: true, version: parsed.version };
  }

  const fromQuery = versionFromQueryParameter(requestUrl);
  if (!fromQuery.ok) {
    return fromQuery;
  }

  if (fromQuery.version) {
    return { ok: true, version: fromQuery.version };
  }

  return versionFromManifest(parsed, ref, fetchManifestLatest);
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
      return invalidPkgPathResult();
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

  const versionResult = await resolveEffectivePackageVersion(parsed, requestUrl, ref, fetchManifestLatest);
  if (!versionResult.ok) {
    return versionResult.result;
  }

  const { version } = versionResult;
  if (!isSafePackageVersion(version)) {
    return invalidVersionResult("Resolved package version must be a valid semver.");
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
