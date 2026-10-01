---
title: Adding a native session-agent adapter
type: component
created: 2026-09-12
updated: 2026-10-01
status: active
confidence: medium
tags: [adapters, host-rpc, cli-agents]
sources:
  - adapters/discovery.ts
  - contract.ts
  - host.ts
  - adapters/launch.ts
  - adapters/codex.ts
  - server.ts
  - lib/composer-target.ts
  - tests/adapters.test.ts
  - package.json
  - app.tsx
---

# Adding a native session-agent adapter

TL;DR: Each supported provider has a bounded host-side discovery path and a native launch path; `hostContract` defines the host RPC seam and `discover` dispatches by provider.

## Purpose

This page defines the host adapter boundary used to discover runnable session identities and prepare native process configuration (`contract.ts:36-53`, `host.ts:6-29`).

## How it works

1. The server resolves the selected project checkout or matching environment path and calls `discover` through the typed host client (`server.ts:38-71`).
2. The host `prepare` handler rediscovers the agent in its supplied working directory before preparing launch configuration; during dispatch, the server supplies the chat's actual folder (`host.ts:12-27`, `server.ts:205-219`).
3. `discover` requires an existing absolute directory, reports Windows as unsupported, and dispatches Claude Code, Codex, or OpenCode discovery (`adapters/discovery.ts:240-282`).
4. Claude Code reads user, project, and enabled installed-plugin agent metadata; OpenCode parses the CLI's `agent list`; Codex enumerates top-level profile files (`adapters/discovery.ts:129-217`, `adapters/discovery.ts:219-238`, `adapters/codex.ts:33-79`).
5. `prepareLaunch` returns a Claude executable override or an OpenCode PATH override; Codex returns no process override because its developer instructions are contributed through BB (`host.ts:18-27`, `adapters/launch.ts:17-60`).

## Provider modes

| Provider | Discovery input | Available identity | Launch output | Failure behavior |
| --- | --- | --- | --- | --- |
| `claude-code` | Absolute checkout path, CLI version/help, settings and agent Markdown | User/project agents and enabled installed plugin agents; project definitions win duplicate IDs | `BB_CLAUDE_CODE_EXECUTABLE` points to a shim that appends the literal `--agent` argument | Unsupported CLI version returns `supported: false`; missing executable/config read errors reject discovery (`adapters/discovery.ts:129-217`, `adapters/launch.ts:29-42`) |
| `acp-opencode` | Absolute checkout path and `opencode agent list` output | Primary and `all` modes; subagents and internal compaction/summary/title agents are excluded | PATH prepends a plugin-owned launcher, which merges `default_agent` into `OPENCODE_CONFIG_CONTENT` | Empty usable list returns `supported: false`; invalid inline config causes the launcher to exit (`adapters/discovery.ts:219-238`, `adapters/discovery.ts:269-281`, `adapters/launch.ts:44-60`) |
| `codex` | `CODEX_HOME` or `~/.codex`, with `NAME.config.toml` profiles | Profile with non-empty `developer_instructions` of at most 4096 characters | BB instruction contribution for the bound thread; no process environment override | Codex below 0.134 is unsupported; missing or oversized instructions reject selection (`adapters/discovery.ts:255-267`, `adapters/codex.ts:81-92`) |

## Business rules

- Provider IDs are `claude-code`, `acp-opencode`, and `codex`; metadata fields and catalog bounds are defined by the schemas (`contract.ts:3-17`).
- Discovery accepts only an existing absolute directory and returns a non-supported catalog on Windows (`adapters/discovery.ts:240-253`).
- Agent IDs are 1–200 characters; descriptions are capped at 1200 characters; catalogs contain at most 2000 agents (`contract.ts:4-17`).
- Claude agent files are capped at 256 KiB, traversal skips hidden entries and is bounded by depth and entry count (`adapters/discovery.ts:68-95`, `adapters/discovery.ts:97-127`).
- Codex profile files are capped at 256 KiB, and only top-level `NAME.config.toml` names matching letters, digits, underscore, and hyphen are considered (`adapters/codex.ts:8-31`, `adapters/codex.ts:49-73`).
- The host `prepare` handler rediscovers the agent in the target folder and rejects a missing identity before returning launch settings (`host.ts:12-17`).

## Public API

`hostContract` is the typed server-to-machine boundary. Its operations and validation shapes are:

| Operation | Input | Output | Purpose |
| --- | --- | --- | --- |
| `discover` | `cwd`, supported `providerId` | bounded catalog | Read agent metadata from the selected machine |
| `instructions` | `agentId` | string up to 4096 characters | Load Codex profile developer instructions |
| `prepare` | `cwd`, `providerId`, `agentId` | array of `{name, value, reason}` | Validate the selected agent and return launch environment entries |

Contract definitions: `contract.ts:36-53`; host handler bindings: `host.ts:6-29`.

`rpcContract` is the app-to-server contract. `plugin(bb)` registers a handler for each declared operation; the app invokes those names through the typed RPC client (`contract.ts:54-98`, `server.ts:110-140`, `app.tsx:26`). Each input and output shape is declared with Zod, including the provider enum, target fields, nullable values, and list/string bounds (`contract.ts:3-35`, `contract.ts:54-98`).

### Plugin RPC contract execution

An RPC call has these stages:

1. The app calls an operation by name with its input object. The contract defines that operation's accepted input and output shapes (`contract.ts:54-98`, `app.tsx:26`).
2. The registered server handler runs the matching implementation. `catalog` and `select` resolve the target before contacting the host; the other handlers read project/thread APIs or KV storage (`server.ts:110-140`).
3. The handler returns its declared output. Any BB SDK, host RPC, or KV error not handled in the method rejects the call; dispatch errors are caught separately by the dispatch hook (`server.ts:110-140`, `server.ts:233-238`).

| Operation | Conditions and steps | Success result | Failure behavior |
| --- | --- | --- | --- |
| `defaults` | Reads the project and default execution options. Chooses the source marked default, otherwise the first source; uses the configured provider or an empty string (`server.ts:111-121`). | `{hostId, providerId}`; empty strings represent missing source/provider defaults (`contract.ts:55-58`). | Project or execution-options SDK failures reject the RPC (`server.ts:111-121`). |
| `catalog` | Validates a `Target`, resolves its checkout/environment, then calls host `discover` on `target.hostId` with the resolved path and provider (`contract.ts:19-24`, `server.ts:38-71`). | Provider `Catalog`, including `supported`, warnings, version, and agents (`contract.ts:12-17`, `contract.ts:59`). | Offline host, mismatched/missing environment, absent checkout, host transport failure, or discovery exception rejects the RPC. Unsupported platform/version is returned as an unsupported catalog by discovery (`server.ts:38-71`, `adapters/discovery.ts:240-282`). |
| `select` | Validates target and `agentId` (1–200 characters), resolves the same target modes as `catalog`, rediscovers, then requires `supported` and an exact agent ID match (`contract.ts:19-24`, `contract.ts:60-63`, `server.ts:73-91`). | Creates a UUID selection with resolved `cwd` and timestamp; writes `selection:<token>` followed by `pending:<projectId>:<providerId>` and returns `{token, label}` (`server.ts:82-91`). | Unsupported catalog or missing ID throws `Agent is not available. Refresh the list.` Resolve/discovery/storage errors reject. The writes are sequential; if writing the pending key fails after the token write, the token record remains (`server.ts:73-91`). |
| `pending` | Reads the project/provider pending key and validates any stored value with `selectionSchema` (`contract.ts:64-70`, `server.ts:97-101`, `server.ts:125`). | Full `Selection` or `null` when the key is absent (`contract.ts:69`). | Malformed stored selection or KV failure rejects the RPC (`server.ts:97-101`). |
| `clearPending` | Deletes only the project/provider pending key (`contract.ts:71-77`, `server.ts:93-95`, `server.ts:125-127`). | Returns `true` after deletion (`contract.ts:76`, `server.ts:93-95`). | KV deletion failure rejects the RPC (`server.ts:93-95`). |
| `thread` | Reads `thread:<threadId>` and validates a present record (`contract.ts:78-81`, `server.ts:62-65`, `server.ts:128`). | Full `Selection` or `null` if no binding exists (`contract.ts:80`). | Malformed binding or KV read failure rejects the RPC (`server.ts:62-65`). |
| `threadProject` | Looks up the BB thread by ID (`contract.ts:82-85`, `server.ts:129-132`). | `{projectId}` for the source thread (`contract.ts:85`, `server.ts:129-132`). | Thread lookup errors reject the RPC (`server.ts:129-132`). |
| `favorites` | Reads the provider's favorite key; a non-array value becomes an empty list, while an array is filtered to strings and capped at 200 entries (`contract.ts:86-89`, `server.ts:103-108`, `server.ts:133`). | Up to 200 agent IDs for one provider (`contract.ts:86-89`). | KV read failures reject; a result that violates the output schema also fails RPC output validation (`contract.ts:86-89`, `server.ts:103-108`). |
| `favorite` | Validates provider, 1–200 character agent ID, and `pinned`; removes any existing copy, appends when pinning, and keeps the last 200 entries (`contract.ts:90-97`, `server.ts:134-138`). | Updated provider favorite list (`contract.ts:97`, `server.ts:135-138`). | KV read/write errors reject; invalid input fails contract validation (`contract.ts:90-97`, `server.ts:134-138`). |

`catalog` and `select` share target resolution but branch on `environmentId`: an existing environment must belong to the requested project and host and have a path; with `environmentId: null`, the server uses the project source matching the host (`server.ts:38-60`). `select` is the only RPC that both checks live agent availability and creates selection state; `pending` and `clearPending` operate on the project/provider slot, while `thread` and `threadProject` operate on a thread ID (`server.ts:73-101`, `server.ts:128-132`).

### Host contract execution

The server creates one typed host client with `hostContract`; each `host.call` supplies an operation name, its payload, and the target `hostId`. The host entry binds those operation names to handlers, and each handler's return value matches the contract's output schema (`contract.ts:36-53`, `server.ts:37`, `host.ts:6-12`). The server calls `discover` for catalog and selection, `prepare` during dispatch, and `instructions` for a selected Codex profile (`server.ts:66-79`, `server.ts:212-228`).

The request sequence is: validate the operation payload; route it to the selected machine; run the mapped host handler; validate and return the declared result. The request schemas constrain `discover` to a supported provider and string `cwd`, `instructions` to a string `agentId`, and `prepare` to `cwd`, provider, and a 1–200 character `agentId` (`contract.ts:3`, `contract.ts:36-53`).

| Operation | Steps and conditions | Success | Failures |
| --- | --- | --- | --- |
| `discover` | Host handler forwards `cwd`, `providerId`, and abort signal to discovery. Discovery requires an existing absolute directory and a supported OS, then branches to Claude Code, Codex, or OpenCode discovery; each adapter checks its CLI/version and reads that provider's identities (`contract.ts:37-40`, `host.ts:10-11`, `adapters/discovery.ts:240-282`). | Returns `Catalog {agents, version, warnings, supported}`. Claude Code returns `supported: false` when `--help` lacks `--agent`, otherwise true; Codex returns false below 0.134 and true at or above it, even when no profile files were found; OpenCode sets support from whether its parsed main-agent list is non-empty. Windows returns false with a warning (`contract.ts:12-17`, `adapters/discovery.ts:129-142`, `adapters/discovery.ts:212-217`, `adapters/discovery.ts:247-267`, `adapters/discovery.ts:269-281`, `adapters/codex.ts:33-79`). | Invalid/nonexistent paths throw. CLI calls time out after 20 seconds; process failures, output-buffer overflow, and configuration parsing failures throw. Unsupported platform/version outcomes are returned as catalogs rather than thrown (`adapters/discovery.ts:18-32`, `adapters/discovery.ts:240-282`). |
| `instructions` | Receives a profile `agentId` and reads that Codex profile's `developer_instructions`; the handler does not take a provider or thread ID (`contract.ts:41-44`, `host.ts:9`, `adapters/codex.ts:81-92`). | Returns the instruction string, limited to 4096 characters by the contract and profile reader (`contract.ts:41-44`, `adapters/codex.ts:81-92`). | Invalid profile IDs, absent/oversized files, missing or empty instructions, and instructions over 4096 characters throw (`adapters/codex.ts:8-31`, `adapters/codex.ts:81-92`). |
| `prepare` | Rediscovers in the supplied `cwd` and requires a supported catalog containing the exact `agentId`. Then it branches by provider: Codex validates the instructions and returns no environment entries; Claude Code and OpenCode resolve their executable and build launch entries (`host.ts:12-27`, `adapters/launch.ts:17-60`). | Returns `envSchema`, an array of `{name, value, reason}` entries; Codex returns `[]`, while Claude Code and OpenCode return their native launcher overrides (`contract.ts:33-35`, `host.ts:18-27`, `adapters/launch.ts:29-60`). | Unsupported catalog or missing ID throws an unavailable-agent error. Executable lookup, invalid Codex instructions, and launcher setup/configuration errors reject the call (`host.ts:12-27`, `adapters/discovery.ts:34-50`, `adapters/codex.ts:81-92`, `adapters/launch.ts:17-60`). |

The host output schemas also cap catalog agents at 2000, descriptions at 1200 characters, instruction strings at 4096 characters, and validate every environment entry's `name`, `value`, and `reason` as strings (`contract.ts:4-17`, `contract.ts:33-53`).

## BB server plugin

`plugin(bb)` restores eligible Codex instructions from BB KV at startup, registers an instruction-contribution callback, and creates the typed host client (`server.ts:27-37`). The callback returns the cached instructions for a requested thread or `null` (`server.ts:28-36`).

For catalog and selection requests, the plugin resolves the target machine and working directory first (`server.ts:38-71`):

| Target mode | Resolution | Failure outcome |
| --- | --- | --- |
| Existing environment (`environmentId` is set) | Requires the machine to be connected, then uses the environment path only when its project and host match the target and the path exists (`server.ts:38-55`). | Throws `Selected machine is offline.` or `Selected environment does not match the machine and project.` (`server.ts:39-54`). |
| Project checkout (`environmentId` is null) | Requires a project source whose `hostId` matches the target host and uses that source path (`server.ts:56-60`). | Throws `This project has no checkout on the selected machine.` when no source matches (`server.ts:57-60`). |

The `binding` helper reads `thread:<threadId>`, validates a stored value with `selectionSchema`, and returns `null` when the key is absent (`server.ts:62-65`).

`catalog` sends `discover` to the resolved host and returns its catalog (`server.ts:66-71`). `select` resolves the same target, rediscovers the catalog, and requires both `supported: true` and an exact matching agent ID; failure throws `Agent is not available. Refresh the list.` On success it creates a UUID selection with the resolved `cwd` and timestamp, writes both `selection:<token>` and `pending:<projectId>:<providerId>`, then returns the token and `Agent: <agentId>` label (`server.ts:73-91`). The composer uses the pending record for its next matching dispatch; the `bb cli-agents select` command also returns a marker that can carry the token in a prompt (`app.tsx:227-249`, `server.ts:250-283`). Host RPC or storage errors propagate to the RPC caller.

## Package shape

- `contract.ts` defines provider, host RPC, and plugin RPC schemas (`contract.ts:3-98`).
- `host.ts` binds the host handlers (`host.ts:6-29`).
- `adapters/discovery.ts` reads provider agent catalogs (`adapters/discovery.ts:129-282`).
- `adapters/codex.ts` reads Codex profile instructions (`adapters/codex.ts:8-92`).
- `adapters/launch.ts` prepares Claude Code and OpenCode launch overrides (`adapters/launch.ts:17-60`).

## Internal model

Discovery returns normalized `Agent` metadata and a `Catalog` with CLI version, warnings, and a support flag. The host's `prepare` operation repeats discovery in the selected working directory before it returns environment entries (`contract.ts:4-17`, `host.ts:10-27`).

The BB server calls this host contract for discovery, selection revalidation, and dispatch-time launch preparation (`server.ts:66-81`, `server.ts:212-219`).

## Dependencies

Runtime adapter dependencies include `yaml` for Claude agent metadata and `smol-toml` for Codex profiles; provider process discovery and file access use Node APIs (`package.json:22-30`, `adapters/discovery.ts:1-17`, `adapters/codex.ts:1-5`).

## Adapter extension points

1. Add the exact provider ID to `providerSchema` and register environment contribution where the existing BB provider uses process environment (`contract.ts:3`, `server.ts:240-249`).
2. Implement discovery on the host. Return bounded identity metadata, omit instruction bodies, and exclude identities that cannot run as the main session (`adapters/discovery.ts:97-127`, `adapters/discovery.ts:219-238`).
3. Implement the native launch behavior while preserving existing process configuration; host `prepare` must rediscover and validate the requested identity (`host.ts:12-27`, `adapters/launch.ts:17-60`).
4. Add the provider to the composer target resolver and cover discovery and launch behavior in tests (`lib/composer-target.ts:9-43`, `tests/adapters.test.ts:88-173`).

## Gotchas

- BB 0.43 does not expose the composer’s execution tuple through the public hook; the target resolver reads the current composer provider and read-only remembered session keys (`lib/composer-target.ts:2-8`, `lib/composer-target.ts:49-58`).
- OpenCode configuration must be JSON in `OPENCODE_CONFIG_CONTENT`; invalid JSON stops the launcher instead of starting with a default agent (`adapters/launch.ts:44-47`).
- Codex profile support applies only `developer_instructions`; other profile configuration is not applied (`adapters/codex.ts:81-92`, `server.ts:221-228`).

An adapter must both discover usable **main-session** identities and launch that identity with the CLI's native configuration. A skill, a prompt snippet, or a subagent-only definition does not qualify.

1. Verify current primary CLI documentation and the BB provider's actual launch protocol (CLI flags do not necessarily apply to ACP).
2. Add its exact BB provider ID to `providerSchema` and the environment-contributor registration in `server.ts`.
3. Add a host-side discovery function that checks CLI presence/version, resolves the selected workspace, returns bounded metadata, and excludes subagent-only/hidden internal agents. Do not return secrets or full system prompts.
4. Add a launch adapter using native CLI arguments or native session configuration. Preserve permissions, models, user configuration, stdin/stdout, signals, and existing environment values. Do not edit shared CLI settings or write to the project. Publish any limitations of provider variants.
5. Add the provider to the read-only composer compatibility module. Unsupported or unresolved targets must not expose a working-looking picker.
6. Test discovery conflicts, removed roles, two simultaneous threads, different hosts/projects, cancellation, reload, and real native agent instructions. Add a real BB session smoke check on an enrolled machine.
7. Update README, PLUGIN_OVERVIEW, engine bounds, changelog and marketplace description together.

The host contract (`contract.ts`) is the extension seam. The BB server owns selection tokens and thread binding; adapters own only native discovery and process configuration. Additional adapters must not register a replacement provider unless the existing BB provider cannot safely carry the native selection.

<!-- lane-pilot:backlinks -->
## Referenced by

- [CLI Agents architecture](architecture.md)
- [CLI Agents overview](overview.md)
