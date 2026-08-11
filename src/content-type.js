const GITHUB_RAW_MEDIA_TYPE = "application/vnd.github.raw";

export const EXTENSION_CONTENT_TYPES = Object.freeze({
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
});

function mediaTypeOnly(contentType) {
  if (!contentType) {
    return "";
  }

  return contentType.toLowerCase().split(";")[0].trim();
}

export function getExtension(pathname) {
  const normalized = String(pathname || "").split(/[\\/]/).pop() || "";
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(dotIndex).toLowerCase();
}

export function resolveContentType(pathname, upstreamContentType) {
  const extension = getExtension(pathname);
  if (extension && Object.hasOwn(EXTENSION_CONTENT_TYPES, extension)) {
    return EXTENSION_CONTENT_TYPES[extension];
  }

  if (mediaTypeOnly(upstreamContentType) === GITHUB_RAW_MEDIA_TYPE) {
    return "application/octet-stream";
  }

  return null;
}

export function withResolvedContentType(response, targetPath) {
  if (response.status !== 200) {
    return response;
  }

  const resolved = resolveContentType(targetPath, response.headers.get("content-type"));
  if (!resolved) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", resolved);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
