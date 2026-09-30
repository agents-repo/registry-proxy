export function segmentContainsPathSeparatorEncoding(segment) {
  return /%2[fF]|%5[cC]/.test(segment);
}

export function isSafePathSegment(segment) {
  if (!segment || segment === "." || segment === "..") {
    return false;
  }

  if (segment.includes("/") || segment.includes("\\")) {
    return false;
  }

  return !segmentContainsPathSeparatorEncoding(segment);
}
