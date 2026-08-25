CREATE TABLE IF NOT EXISTS download_counts (
  namespace TEXT NOT NULL,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  target_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (namespace, package_id, version, target_id)
);

CREATE INDEX IF NOT EXISTS idx_download_counts_package
  ON download_counts (namespace, package_id);
