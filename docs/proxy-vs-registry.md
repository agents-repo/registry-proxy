# Proxy vs registry — where to work

| Question | Work in **registry** | Work in **registry-proxy** |
| --- | --- | --- |
| Package layout, metadata, ZIP artifacts | Yes | No |
| Normative specs (`specs/`) | Yes | Read upstream only |
| Catalog index, `packages/` tree | Yes | No |
| HTTP caching, Worker routing, D1 downloads | No | Yes |
| GitHub Raw path mapping | No | Yes |
| Public site UI (agents-repo.org) | No | No (see **webapp**) |
| CLI install behavior | No | No (see **cli**) |

## Rule of thumb

- **Data and rules** → [agents-repo/registry](https://github.com/agents-repo/registry)
- **Delivery and caching** → [agents-repo/registry-proxy](https://github.com/agents-repo/registry-proxy)

When changing proxy path behavior, read upstream
[specs/chat-consumption.md](https://github.com/agents-repo/registry/blob/main/specs/chat-consumption.md)
and [specs/package-format.md](https://github.com/agents-repo/registry/blob/main/specs/package-format.md)
before editing `src/worker.js`.
