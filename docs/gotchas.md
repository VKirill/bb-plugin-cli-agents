---
title: CLI Agents gotchas
type: gotchas
created: 2026-09-27
updated: 2026-10-01
status: active
confidence: medium
tags: [gotchas, compatibility, limitations]
sources:
  - lib/handoff-mode.ts
  - lib/composer-target.ts
  - adapters/discovery.ts
  - adapters/launch.ts
  - server.ts
  - host.ts
  - lib/draft-selection.ts
  - app.tsx
  - tests/adapters.test.ts
---

# CLI Agents gotchas

TL;DR: Composer integration depends on BB 0.43 behavior, target resolution rejects unsupported or unresolved selections, and dispatch rejects identities that disappear or fail host validation.

## Critical

### Handoff mode is detected from visible button labels

**Problem:** BB 0.43 exposes handoff as `scope.kind === "thread"` without a public handoff flag, so the plugin matches English and Russian button labels in the composer form.

**Risk:** A label rename can hide the picker or route the draft into the wrong draft slot.

**Workaround:** Keep the locale strings in `HANDOFF_LABEL` aligned with BB’s handoff form and retain tests for both languages.

`lib/handoff-mode.ts:1-33`, `lib/draft-selection.ts:21-51`.

## High

### Unsupported composer targets have no working picker

**Problem:** Target resolution only accepts the three provider IDs and a host ID with the `host_` prefix; unsupported environment variants return no target. A mounted composer whose provider chip has no logo resolves to `unknown`, which also fails provider validation (`lib/composer-target.ts:14-43`, `lib/composer-target.ts:45-58`).

**Risk:** The picker is absent when BB cannot resolve a supported provider, machine, or environment from the composer (`app.tsx:107-125`, `app.tsx:296`).

**Workaround:** Select a supported CLI and a project checkout or reusable environment on a connected host before opening the picker (`server.ts:38-60`).

### Agent removal between selection and dispatch rejects the message

**Problem:** The host rediscovers the selected agent in the actual chat folder before preparing its launch (`host.ts:12-17`).

**Risk:** A selection made in the project root can fail if that agent is absent in the folder assigned to the chat.

**Workaround:** Add the agent to the target folder or choose an agent present there; dispatch errors reject rather than starting the default identity (`server.ts:212-238`).

## Medium

### BB session keys are a read-only integration

**Problem:** Composer target resolution reads remembered keys from `sessionStorage` only and uses the visible provider chip when present (`lib/composer-target.ts:2-8`, `lib/composer-target.ts:16-43`).

**Risk:** A future BB change to its internal keys or provider-chip markup can prevent target resolution.

**Workaround:** Keep compatibility coverage for the composer chip and remembered-key fallback; the plugin does not write BB-owned keys (`lib/composer-target.ts:2-8`, `tests/adapters.test.ts:88-173`).

### Invalid OpenCode inline configuration stops its launcher

**Problem:** The OpenCode launcher parses `OPENCODE_CONFIG_CONTENT` as a JSON object before setting `default_agent` (`adapters/launch.ts:44-47`).

**Risk:** Malformed or non-object inline JSON terminates launcher startup.

**Workaround:** Correct the inline JSON in the BB provider configuration before selecting an OpenCode agent.

<!-- lane-pilot:backlinks -->
## Referenced by

- [Verification gotchas](VERIFICATION.md)
- [CLI Agents overview](overview.md)
