---
title: Verification gotchas
type: gotchas
created: 2026-09-12
updated: 2026-09-27
status: active
confidence: medium
tags: [verification, adapters, integration]
sources:
  - tests/adapters.test.ts
  - tests/server.test.ts
  - package.json
  - server.ts
  - host.ts
---

# Verification gotchas

TL;DR: Automated coverage includes handoff state and binding cases, while the live BB results below cover the Claude Code, OpenCode, and Codex adapter paths.

## Critical

### Handoff has automated coverage but no recorded live BB check

**Problem:** Handoff label parsing, draft isolation, project lookup, and pending binding are exercised through unit tests (`tests/adapters.test.ts:208-245`, `tests/server.test.ts:291-389`).

**Risk:** These tests do not exercise the actual BB handoff interface or a live submitted handoff (`tests/adapters.test.ts:208-245`, `tests/server.test.ts:291-389`).

**Workaround:** Run a live handoff check on the deployed BB version before treating UI integration as verified.

## High

### Package checks do not establish host-specific CLI behavior

**Problem:** The package declares typecheck, test, and build commands (`package.json:85-90`).

**Risk:** Passing package checks alone does not establish that a selected host has a compatible CLI or that its native process uses the requested agent (`host.ts:12-27`).

**Workaround:** Verify the target machine and CLI with the checks in [deployment](deployment.md); live checks are recorded below.

## Medium

### Live checks cover specific recorded versions and paths

**Problem:** Recorded live checks exercised Claude Code 2.1.269 and OpenCode 1.14.48 on BB 0.43.0 with an enrolled Linux host. Codex 0.154.0 instruction contribution was checked on macOS and enrolled Linux.

**Risk:** These checks do not cover Windows, custom absolute-path OpenCode ACP configurations, or general permission-policy behavior.

**Workaround:** Treat the recorded results as evidence for those versions and paths only; unsupported and platform-specific behavior is listed in [gotchas](gotchas.md).

## Live adapter checks

- Claude Code 2.1.269: selected an installed plugin's namespaced agent through the graphical menu, sent a no-tools identity check through the ordinary composer, and received `CLI_AGENTS_OK — dev-orchestrator`. The bound identity was `lane-stack:dev-orchestrator`.
- OpenCode 1.14.48 through the stock `acp-opencode` provider: selected `lane-reviewer`, started a BB session on the same remote checkout, and received `CLI_AGENTS_OK lane-reviewer`.
- The verification conversations were stopped and archived after completion.
- Codex 0.154.0: fresh BB conversations received developer instructions from selected file profiles on macOS and enrolled Linux. The macOS check returned a control phrase present only in the profile. This validates instruction-profile support; it does not claim that other profile settings are applied.
