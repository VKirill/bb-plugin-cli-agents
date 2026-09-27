# CLI Agents for BB

CLI Agents adds a picker for native Claude Code, OpenCode, and Codex session agents to BB’s new-thread and handoff composers.

## Quick start

```sh
npm ci
npm run build
bb plugin install .
```

Choose a supported CLI and agent in the composer, then send your prompt. The plugin binds the selection to the resulting chat. See the [overview](docs/overview.md) to understand the feature, the [deployment guide](docs/deployment.md) to install it, and the [architecture](docs/architecture.md) for its runtime behavior.

## Documentation

- [Supported adapter behavior and extension contract](docs/ADAPTERS.md)
- [Stored selection data](docs/data-model.md)
- [Known limitations](docs/gotchas.md)
- [Verification record](docs/VERIFICATION.md)
