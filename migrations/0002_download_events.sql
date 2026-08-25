DROP INDEX IF EXISTS idx_download_counts_package;
DROP TABLE IF EXISTS download_counts;

CREATE TABLE download_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace TEXT NOT NULL,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  target_id TEXT NOT NULL,
  downloaded_at TEXT NOT NULL
);

CREATE INDEX idx_download_events_package_time
  ON download_events (namespace, package_id, downloaded_at);

CREATE INDEX idx_download_events_time
  ON download_events (downloaded_at);
