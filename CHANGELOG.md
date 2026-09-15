# Changelog

## 0.2.3

- Resolve the CLI from the provider chip of the composer the picker is mounted in, so the list always matches the CLI shown in that chat.
- Stop reading BB's shared localStorage copy of the remembered selection; another window or chat can no longer leak its CLI into this picker.
- Reload the agent list in place when the machine or CLI changes instead of closing the popover.
- Star agents to keep them at the top of the list; stars are stored per CLI on the BB server and shared across windows and machines.
- Show the resolved CLI next to the picker heading.

## 0.2.2

- Do not block thread dispatch when running on CLI providers that do not support session agents or profiles (e.g. Cursor, Antigravity).
- Pass agents and profiles only to matching, supported CLI providers; silently proceed without configuration when provider does not match.
- Automatically clear orphaned or mismatched transport mentions from composer draft when switching to an unsupported provider or different execution target.

## 0.2.1

- Hide the duplicate Agent selection pill in the composer and chat messages; keep the selected agent in the dropdown.
- Preserve native structured selection transport and leave other plugins and file mentions unchanged.
- Remove the presentation style when the plugin is unloaded.

## 0.2.0

- Add Codex Profile picker for file-based profiles (Codex 0.134+).
- Apply developer_instructions through BB with explicit 4096-character limit.
- Keep BB model and permission controls; reject configuration-only and oversized profiles instead of silently ignoring instructions.
- Document that native app-server does not accept --profile and full profile configuration is not applied.

## 0.1.0

- Native session-agent picker for Claude Code and stock OpenCode ACP.
- Remote machine/workspace discovery, enabled Claude plugins and OpenCode primary/all modes.
- Thread-scoped selection, native launch adapters and fail-closed dispatch checks.
- Search, refresh, replacement/reset before submission and a standard SVG chevron.
- Public-source package, typed contracts, tests and draft marketplace metadata.
