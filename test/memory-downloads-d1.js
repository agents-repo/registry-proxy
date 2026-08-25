function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatSqliteUtc(date) {
  return [
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`,
  ].join(" ");
}

function parseSqliteUtc(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(value));
  if (!match) {
    return new Date(NaN);
  }

  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ));
}

function offsetSqliteUtc(now, days) {
  const date = parseSqliteUtc(now);
  date.setUTCDate(date.getUTCDate() - days);
  return formatSqliteUtc(date);
}

function emptyWindows() {
  return {
    downloads: 0,
    downloads_7d: 0,
    downloads_30d: 0,
    downloads_365d: 0,
  };
}

function addWindows(target, downloadedAt, now) {
  target.downloads += 1;
  if (downloadedAt >= offsetSqliteUtc(now, 7)) {
    target.downloads_7d += 1;
  }
  if (downloadedAt >= offsetSqliteUtc(now, 30)) {
    target.downloads_30d += 1;
  }
  if (downloadedAt >= offsetSqliteUtc(now, 365)) {
    target.downloads_365d += 1;
  }
}

function sortPackages(results, orderColumn) {
  return [...results].sort((a, b) => {
    if (b[orderColumn] !== a[orderColumn]) {
      return b[orderColumn] - a[orderColumn];
    }
    if (a.namespace !== b.namespace) {
      return a.namespace.localeCompare(b.namespace);
    }
    return a.package_id.localeCompare(b.package_id);
  });
}

function orderColumnFromSql(sql) {
  if (sql.includes("ORDER BY downloads_7d")) {
    return "downloads_7d";
  }
  if (sql.includes("ORDER BY downloads_30d")) {
    return "downloads_30d";
  }
  if (sql.includes("ORDER BY downloads_365d")) {
    return "downloads_365d";
  }
  return "downloads";
}

export function createMemoryDownloadsDb(options = {}) {
  const events = [];
  let now = options.now ?? formatSqliteUtc(new Date());

  function windowTotals(filtered) {
    const totals = emptyWindows();
    for (const event of filtered) {
      addWindows(totals, event.downloaded_at, now);
    }
    return totals;
  }

  return {
    setNow(value) {
      now = value;
    },
    seedEvent(event) {
      events.push({
        namespace: event.namespace,
        package_id: event.packageId ?? event.package_id,
        version: event.version,
        target_id: event.targetId ?? event.target_id,
        downloaded_at: event.downloaded_at,
      });
    },
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      let params = [];

      return {
        bind(...values) {
          params = values;
          return this;
        },
        async run() {
          if (!/INSERT/i.test(normalized)) {
            return { success: true };
          }

          const [namespace, packageId, version, targetId] = params;
          events.push({
            namespace,
            package_id: packageId,
            version,
            target_id: targetId,
            downloaded_at: now,
          });

          return { success: true };
        },
        async all() {
          if (/GROUP BY namespace, package_id/i.test(normalized)) {
            const totals = new Map();
            for (const event of events) {
              const key = `${event.namespace}\0${event.package_id}`;
              const current = totals.get(key) ?? {
                namespace: event.namespace,
                package_id: event.package_id,
                ...emptyWindows(),
              };
              addWindows(current, event.downloaded_at, now);
              totals.set(key, current);
            }

            return {
              results: sortPackages([...totals.values()], orderColumnFromSql(normalized)),
              success: true,
            };
          }

          if (/GROUP BY version, target_id/i.test(normalized)) {
            const [namespace, packageId] = params;
            const artifacts = new Map();
            for (const event of events) {
              if (event.namespace !== namespace || event.package_id !== packageId) {
                continue;
              }
              const key = `${event.version}\0${event.target_id}`;
              const current = artifacts.get(key) ?? {
                version: event.version,
                target_id: event.target_id,
                count: 0,
              };
              current.count += 1;
              artifacts.set(key, current);
            }

            const results = [...artifacts.values()].sort((a, b) => {
              if (a.version !== b.version) {
                return a.version.localeCompare(b.version);
              }
              return a.target_id.localeCompare(b.target_id);
            });

            return { results, success: true };
          }

          return { results: [], success: true };
        },
        async first() {
          if (/WHERE namespace = \? AND package_id = \?/i.test(normalized) && /COUNT\(\*\)/i.test(normalized)) {
            const [namespace, packageId] = params;
            const filtered = events.filter(
              (event) => event.namespace === namespace && event.package_id === packageId,
            );
            return windowTotals(filtered);
          }

          const { results } = await this.all();
          return results[0] ?? null;
        },
      };
    },
  };
}
