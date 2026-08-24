export function createMemoryDownloadsDb() {
  const rows = new Map();

  function rowKey(namespace, packageId, version, targetId) {
    return JSON.stringify([namespace, packageId, version, targetId]);
  }

  return {
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
          const key = rowKey(namespace, packageId, version, targetId);
          const existing = rows.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            rows.set(key, {
              namespace,
              package_id: packageId,
              version,
              target_id: targetId,
              count: 1,
            });
          }

          return { success: true };
        },
        async all() {
          if (/GROUP BY/i.test(normalized)) {
            const totals = new Map();
            for (const row of rows.values()) {
              const key = `${row.namespace}\0${row.package_id}`;
              const current = totals.get(key) ?? {
                namespace: row.namespace,
                package_id: row.package_id,
                downloads: 0,
              };
              current.downloads += row.count;
              totals.set(key, current);
            }

            const results = [...totals.values()].sort((a, b) => {
              if (b.downloads !== a.downloads) {
                return b.downloads - a.downloads;
              }
              if (a.namespace !== b.namespace) {
                return a.namespace.localeCompare(b.namespace);
              }
              return a.package_id.localeCompare(b.package_id);
            });

            return { results, success: true };
          }

          if (/WHERE/i.test(normalized)) {
            const [namespace, packageId] = params;
            const results = [...rows.values()]
              .filter((row) => row.namespace === namespace && row.package_id === packageId)
              .map((row) => ({
                version: row.version,
                target_id: row.target_id,
                count: row.count,
              }))
              .sort((a, b) => {
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
          const { results } = await this.all();
          return results[0] ?? null;
        },
      };
    },
  };
}
