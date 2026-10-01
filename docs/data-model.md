---
title: CLI Agents data model
type: data-model
created: 2026-09-27
updated: 2026-10-01
status: active
confidence: medium
tags: [data-model, key-value, selection]
sources:
  - server.ts
  - app.tsx
  - lib/draft-selection.ts
  - contract.ts
  - adapters/launch.ts
  - adapters/codex.ts
  - tests/server.test.ts
---

# CLI Agents data model

TL;DR: CLI Agents defines no relational database tables; it stores selections, thread bindings, launch environment, Codex instructions, and favorites as BB key-value records.

## Schema overview

The diagram shows record families and their key relationships; `PK` marks the suffix or value that identifies a record in BB KV storage.

```mermaid
erDiagram
  SELECTION_TOKEN {
    string token PK
    string projectId
    string hostId
    string providerId
    string environmentId
    string cwd
    string agentId
    number createdAt
  }
  PENDING_SELECTION {
    string projectId PK
    string providerId PK
    string token
  }
  THREAD_BINDING {
    string threadId PK
    string token
    string agentId
    string cwd
  }
  THREAD_ENVIRONMENT {
    string threadId PK
    string name
    string value
    string reason
  }
  THREAD_INSTRUCTIONS {
    string threadId PK
    string instructions
  }
  FAVORITES {
    string providerId PK
    string agentIds
  }
  COMPOSER_SESSION_SELECTION {
    string projectId PK
    string providerId PK
    string agentId
  }
  SELECTION_TOKEN ||--o| PENDING_SELECTION : "referenced by token"
  SELECTION_TOKEN ||--o| THREAD_BINDING : "copied into binding"
  THREAD_BINDING ||--o{ THREAD_ENVIRONMENT : "selects launch values"
  THREAD_BINDING ||--o| THREAD_INSTRUCTIONS : "Codex only"
  PENDING_SELECTION }o..o| COMPOSER_SESSION_SELECTION : "mirrored in composer session"
```

Record schemas and key construction are in the server's KV accessors and the `Selection` and `envSchema` contracts (`server.ts:63-108`, `server.ts:227-248`, `contract.ts:19-35`).

## Records

### Selection token — `selection:<uuid>`

Purpose: preserve a selected identity by UUID. The composer picker uses the pending record; the CLI `select` command returns this token as a marker for message resolution (`server.ts:82-91`, `server.ts:141-155`, `server.ts:250-283`).

| Field | Meaning |
| --- | --- |
| `projectId` | BB project chosen in the composer. |
| `hostId` | Machine where the CLI agent was discovered. |
| `providerId` | One of `claude-code`, `acp-opencode`, or `codex`. |
| `environmentId` | Selected BB environment ID, or `null` for project checkout. |
| `agentId` | Provider-native agent or profile identity. |
| `cwd` | Absolute working directory resolved when selected; dispatch can replace it with the actual chat environment path. |
| `token` | UUID used to look up this record when a structured selection marker is submitted, including one produced by the CLI command (`server.ts:141-155`, `server.ts:250-283`). |
| `createdAt` | Unix epoch timestamp in milliseconds from `Date.now()`. |

The runtime validator and allowed providers are defined in `contract.ts:3-31`; dispatch's folder rebinding is in `server.ts:205-219`.

### Pending selection — `pending:<projectId>:<providerId>`

Purpose: hold the most recently selected identity for the next matching new-thread dispatch, including a handoff that creates a new thread, without requiring a mention token in the submitted text (`server.ts:89-101`, `server.ts:182-193`, `app.tsx:60-73`, `app.tsx:227-249`). The value is a full Selection record. The app reads it to restore the picker label and dispatch consumes it only when the dispatch host is absent or matches the stored host (`app.tsx:143-182`, `server.ts:182-191`).

| Field | Meaning |
| --- | --- |
| `projectId` | Project scope in the key and stored selection. |
| `providerId` | CLI scope in the key and stored selection. |
| Value | Selection record, including machine, environment, working directory, agent ID, token, and creation timestamp (`contract.ts:19-31`). |

### Thread binding — `thread:<threadId>`

Purpose: keep the chosen identity attached to a chat across later turns and plugin reloads (`server.ts:62-65`, `server.ts:227-232`). The value is a full Selection record.

| Field | Meaning |
| --- | --- |
| `threadId` | BB thread ID in the key. |
| Value | Selection record; `cwd` may be changed to the actual thread environment before storage (`server.ts:205-211`, `server.ts:230`). |

### Thread environment — `env:<threadId>`

Purpose: persist host-returned process environment entries for supported environment-contributing providers (`server.ts:227-248`).

| Field | Meaning |
| --- | --- |
| `threadId` | BB thread ID in the key. |
| `name` | Environment variable name, such as `BB_CLAUDE_CODE_EXECUTABLE` or `PATH` (`adapters/launch.ts:29-60`). |
| `value` | Variable value returned by host preparation. |
| `reason` | Human-readable reason attached to the environment entry (`contract.ts:33-35`). |

### Thread instructions — `instructions:<threadId>`

Purpose: persist Codex profile instructions so BB can contribute them again after plugin reload (`server.ts:28-36`, `server.ts:221-228`).

| Field | Meaning |
| --- | --- |
| `threadId` | BB thread ID in the key. |
| Value | `developer_instructions` string, required to be non-empty and at most 4096 characters (`adapters/codex.ts:81-92`). |

### Favorites — `favorites:<providerId>`

Purpose: retain starred agent IDs per provider (`server.ts:103-108`, `server.ts:133-138`).

| Field | Meaning |
| --- | --- |
| `providerId` | CLI provider whose picker list uses the saved favorites. |
| Value | Ordered string array, filtered to strings and capped at 200 on read; pinning also retains the most recent 200 (`server.ts:103-108`, `server.ts:133-138`). |

### Composer session selection — `bb.cli-agents.selected:<projectId>:<providerId>`

Purpose: cache the selected agent ID in the browser session so the picker can restore its label for the matching project and CLI (`app.tsx:40-54`, `app.tsx:143-182`).

| Field | Meaning |
| --- | --- |
| `projectId` | BB project scope encoded in the key. |
| `providerId` | Supported CLI scope encoded in the key. |
| Value | Selected provider-native agent or profile ID; after a successful `pending` RPC the picker synchronizes it from the server's pending Selection record. |

The picker writes this cache after selection and after reading a pending record; it removes the key when no pending agent is returned or when the user chooses the default agent (`app.tsx:143-182`, `app.tsx:227-276`). Draft observation keeps separate `new-thread:<projectId>` and `handoff:<threadId>` keys in memory so cleanup applies to the active composer draft (`lib/draft-selection.ts:21-51`, `app.tsx:184-207`).

If the `pending` RPC rejects, the catch handler leaves the previously read session cache untouched (`app.tsx:148-178`).

## Selection lifecycle

| From | To | Function and location | When |
| --- | --- | --- | --- |
| No pending value | Pending selection | `select` (`server.ts:73-91`) | After host rediscovery confirms the chosen ID; writes both token and project/provider pending records. |
| Pending selection | Consumed | `message.dispatch` (`server.ts:182-191`) | A dispatch has no mention-bound selection; the pending record is consumed when its stored host matches the dispatch host or the dispatch context has no host ID. |
| Pending selection | Pending selection | `message.dispatch` (`server.ts:182-191`) | Both host IDs are present and differ; dispatch does not apply or delete the pending selection. |
| Pending selection | Removed | `clearPending` (`server.ts:93-101`, `server.ts:125-127`) | The picker invokes `clearPending` for the target project and provider. |
| No cached agent | Cached agent ID | `AgentPicker` (`app.tsx:227-249`) | Selection succeeds; the provider-native agent ID is stored in browser `sessionStorage`. |
| Cached agent ID | Cached agent ID or no cache | `AgentPicker` (`app.tsx:143-182`) | The picker mirrors the pending server selection into the cache, or removes the cache when no pending agent exists. |
| Cached agent ID | No cached agent | `clearSelection` (`app.tsx:256-276`) | The user chooses “Use default agent”; the picker removes the cache and requests pending-record deletion. |
| Selected | Thread binding | `message.dispatch` (`server.ts:227-232`) | Host preparation succeeds; the selected record and environment entries are stored by thread ID. |

None of these records has a status field. The selection-token record has no delete call in the plugin server; the source defines no TTL or cleanup job for these KV prefixes (`server.ts:73-101`, `server.ts:141-155`, `server.ts:227-248`). The composer cache has the explicit removal paths listed above (`app.tsx:143-182`, `app.tsx:256-269`).

## Invariants and use cases

- Selection, pending, thread-binding, environment, instruction, and favorite records are written and read by the BB server; the composer session cache is written and read by the app (`server.ts:73-108`, `server.ts:227-248`, `app.tsx:143-182`).
- Pending selection is scoped by project and provider. Dispatch also checks the selected host before consuming it (`server.ts:89-101`, `server.ts:182-191`).
- A binding stores the selection per thread; dispatch rejects replacing an existing binding with a different token (`server.ts:170-181`, `server.ts:227-232`).
- Codex instructions are loaded from all `instructions:` keys during server startup and only strings up to 4096 characters enter the in-memory contribution map (`server.ts:28-36`).
- The server source defines no retention or cleanup job for these prefixes; favorites are bounded to 200 IDs at read and write (`server.ts:103-108`, `server.ts:133-138`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [CLI Agents architecture](architecture.md)
- [CLI Agents overview](overview.md)
