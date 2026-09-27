---
title: CLI Agents project facts
updated: 2026-09-27
sources:
  - package.json
  - app.tsx
  - server.ts
  - contract.ts
  - host.ts
  - lib/composer-target.ts
  - lib/handoff-mode.ts
  - lib/draft-selection.ts
  - docs/architecture.md
  - docs/data-model.md
  - docs/gotchas.md
---

# CLI Agents project facts

## Identity

- BB plugin for native session agents in Claude Code, OpenCode, and Codex (`package.json:9-20`, `contract.ts:3`).
- Runtime bounds: BB `>=0.43.0 <0.44.0`; Plugin SDK `>=0.4.84 <0.5.0` (`package.json:5-8`).

## Entry points

- BB server: `server.ts`; registers plugin RPC, mentions, dispatch hook, environment contributors, and CLI commands (`package.json:15`, `server.ts:110-140`, `server.ts:157-249`, `server.ts:250-293`).
- Composer app: `app.tsx`; picker on `new-thread` and `thread` scopes; the thread picker activates for handoff (`package.json:16`, `app.tsx:495-510`).
- Host: `host.ts`; typed `discover`, `instructions`, and `prepare` handlers (`package.json:17`, `host.ts:6-29`).
- Shared contracts: `contract.ts`; provider, catalog, target, selection, host RPC, and plugin RPC schemas (`contract.ts:3-98`).

## Critical invariants

- One token per message and one bound selection per thread (`server.ts:167-181`).
- Dispatch validates provider, project, machine, and agent availability before proceeding (`server.ts:160-203`, `host.ts:12-17`).
- Handoff state is in a thread composer and uses a separate `handoff:<threadId>` draft key (`lib/handoff-mode.ts:1-33`, `lib/draft-selection.ts:21-51`).
- See [architecture](docs/architecture.md) and [data model](docs/data-model.md).

## Conventions

- Provider IDs: `claude-code`, `acp-opencode`, `codex` (`contract.ts:3`).
- Selection persistence: BB KV keys; do not introduce SQL assumptions (`server.ts:63-108`, `server.ts:227-248`).
- Host discovery and launch behavior belong in provider adapters; the host rechecks an identity before preparing process environment (`host.ts:10-27`).
- See [adapter contract](docs/ADAPTERS.md).

## Common gotchas

- Handoff detection matches en/ru button labels because the public composer scope does not distinguish it (`lib/handoff-mode.ts:1-8`).
- Composer target resolution depends on the visible provider chip and read-only BB session keys (`lib/composer-target.ts:2-8`, `lib/composer-target.ts:49-58`).
- See [gotchas](docs/gotchas.md).

## Useful commands

- `npm ci` — install dependencies.
- `npm run typecheck` — TypeScript check.
- `npm test` — run Vitest.
- `npm run build` — build plugin bundles.
- `bb plugin install .` — install this local plugin source.
- `bb plugin reload cli-agents` — reload the installed plugin.
- Script declarations: `package.json:85-90`; BB install instructions: [README](README.md).

## Where to look next

- [Overview](docs/overview.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Adapters](docs/ADAPTERS.md)
- [Data model](docs/data-model.md)
- [Verification](docs/VERIFICATION.md)
