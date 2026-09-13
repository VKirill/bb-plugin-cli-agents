# Changelog

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
