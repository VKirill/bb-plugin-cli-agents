---
title: CLI Agents overview
type: overview
created: 2026-09-27
updated: 2026-09-27
status: active
confidence: medium
tags: [cli-agents, overview, bb-plugin]
sources:
  - package.json
  - app.tsx
  - contract.ts
  - server.ts
  - adapters/launch.ts
---

# CLI Agents overview

TL;DR: CLI Agents adds a BB composer picker that selects a native Claude Code, OpenCode, or Codex agent and binds it to a chat.

## What it is

CLI Agents is a BB plugin with a frontend composer action, a BB server module, and a host entry for machine-side CLI discovery and process setup (`package.json:9-20`). The picker is registered for new-thread and thread composers; in thread scope it appears for handoff composers (`app.tsx:495-510`, `app.tsx:23-38`).

The plugin supports three BB provider IDs: `claude-code`, `acp-opencode`, and `codex` (`contract.ts:3`). Claude Code and OpenCode receive native launch configuration; Codex selection contributes the profile's developer instructions through BB (`server.ts:221-228`, `adapters/launch.ts:29-60`).

## Stack

- TypeScript ES modules with React for the BB composer UI (`package.json:3-8`, `package.json:15-20`).
- `@get-bb/plugin-sdk` 0.4.84 for BB plugin and host contracts (`package.json:31-33`).
- Zod for runtime validation of provider, selection, catalog, and RPC payloads (`package.json:22-30`, `contract.ts:3-35`).

## Quick start

The plugin declares its server, app, and host entry files and build command (`package.json:9-20`, `package.json:85-89`).

```sh
npm ci
npm run build
bb plugin install .
```

The BB install command is also listed in the root [README](../README.md).

## Where to look next

- [Architecture](architecture.md) — component boundaries, contracts, and dispatch flow.
- [Adapters](ADAPTERS.md) — discovery and launch behavior, plus the host RPC extension seam.
- [Data model](data-model.md) — BB key-value records used for selections and thread state.
- [Deployment](deployment.md) — local build and install procedure.
- [Gotchas](gotchas.md) — unsupported targets and integration limits.

<!-- lane-pilot:backlinks -->
## Referenced by

- [CLI Agents architecture](architecture.md)
- [CLI Agents deployment](deployment.md)
