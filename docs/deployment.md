---
title: CLI Agents deployment
type: deployment
created: 2026-09-27
updated: 2026-10-01
status: active
confidence: medium
tags: [deployment, installation, bb-plugin]
sources:
  - package.json
  - docs/overview.md
  - host.ts
  - adapters/discovery.ts
  - server.ts
  - app.tsx
  - adapters/codex.ts
---

# CLI Agents deployment

TL;DR: Build the package with the declared npm scripts, install the local plugin source into BB, then confirm BB lists the plugin and the composer shows an agent for a supported target.

## Prerequisites

- Node.js with npm and the BB CLI available in the shell; the package declares its build and check scripts (`package.json:85-90`). See the [overview quick start](overview.md#quick-start).
- BB 0.43.0 or later and Plugin SDK 0.4.84 or later; the manifest declares no upper bounds (`package.json:5-8`).
- macOS or Linux and the supported CLI installed on the selected BB machine; discovery reports Windows unsupported and resolves the executable on the host (`adapters/discovery.ts:34-50`, `adapters/discovery.ts:240-253`).
- A BB project checkout or a matching environment path on a connected machine (`server.ts:38-60`).

## Deploy procedure

1. From the plugin root, install the locked dependencies and build the declared server, app, and host entries (`package.json:9-20`, `package.json:85-89`).

   ```sh
   npm ci
   npm run build
   ```

2. Install the local package source into BB using the [overview quick-start command](overview.md#quick-start); the package manifest declares the BB plugin entry points (`package.json:9-20`).

   ```sh
   bb plugin install .
   ```

3. In BB, select a project, machine or reusable environment, and one supported CLI. Choose an agent in the composer before submitting a chat (`server.ts:38-60`, `app.tsx:23-38`).

## Verify

1. Confirm `CLI Agents` appears in `bb plugin list`.
2. Open a project checkout with a connected host and supported CLI. The app requests the provider's catalog through the server's typed host call (`app.tsx:141-150`, `server.ts:66-71`).
3. Select an agent and submit a prompt. Dispatch prepares the host environment and writes the thread binding before returning `proceed` (`server.ts:212-232`).
4. For an automated package check, run `npm run typecheck`, `npm test`, and `npm run build` (`package.json:85-90`).

## Rollback

1. Check out the previous release tag or commit in a clean working tree.
2. From that checkout, run `npm ci`, `npm run build`, then `bb plugin install .` to reinstall that source (`package.json:9-20`, `package.json:85-89`; see the [overview quick start](overview.md#quick-start)).
3. Run `bb plugin reload cli-agents` so the server, app, and host bundles use the restored source.

## Troubleshooting

- **No agent appears:** check that the selected CLI is installed on the selected host and inspect discovery warnings; host discovery returns an unsupported catalog for Windows and incompatible provider versions (`adapters/discovery.ts:240-282`).
- **“Selected machine is offline”:** reconnect the selected machine; target resolution rejects non-connected machines (`server.ts:38-42`).
- **Agent is unavailable at dispatch:** confirm the agent exists in the folder assigned to the chat; the host rediscovers it before launch (`host.ts:12-17`).
- **Codex profile cannot be selected:** add non-empty `developer_instructions` of at most 4096 characters to a top-level `NAME.config.toml` file (`adapters/codex.ts:49-73`, `adapters/codex.ts:81-92`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Verification gotchas](VERIFICATION.md)
- [CLI Agents overview](overview.md)
