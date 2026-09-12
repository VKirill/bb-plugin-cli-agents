# Verification — 0.1.0

## Automated

`npm run typecheck`, `npm test` and `bb plugin build` verify the TypeScript contracts, adapter behavior, server-side hook behavior and all three distributable bundles.

The tests cover literal Claude argument passing, permission-argument preservation, OpenCode inline-config merge and PATH restoration, subagent filtering, plugin-agent metadata parsing, path containment, tab-local target selection, default selection, unsupported providers/worktree targets, precise mention removal, thread isolation, reload persistence and missing-agent rejection.

## Live BB integration

Verified on BB 0.43.0 with an enrolled Linux host:

- Claude Code 2.1.269: selected an installed plugin's namespaced agent through the graphical menu, sent a no-tools identity check through the ordinary composer, and received `CLI_AGENTS_OK — dev-orchestrator`. The plugin's bound selection retained the exact native identity `lane-stack:dev-orchestrator`.
- OpenCode 1.14.48 through the stock `acp-opencode` provider: selected `lane-reviewer`, started a BB session on the same remote checkout and received `CLI_AGENTS_OK lane-reviewer`.
- Both verification conversations were stopped and archived after completion.

These are adapter/session checks, not benchmarks or permission-policy certification. They confirm the existing installed providers and native CLI versions listed above. Windows and custom absolute-path OpenCode ACP definitions were not tested and are not supported by this release.

## 0.2.0 Codex verification

Codex 0.154.0 on macOS and enrolled Linux: fresh BB conversations received developer instructions from selected file profiles. The macOS test returned a unique control phrase that appeared only in the profile, not the user prompt. No tools or database operations were requested. This verifies instruction-profile support only; native app-server rejects --profile and full profile configuration is intentionally not applied.
