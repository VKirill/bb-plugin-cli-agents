# CLI Agents for BB

Choose a native session agent from the New thread composer, on the machine and in the project you selected. Claude Code and OpenCode load native agents themselves. Codex profiles supply additional instructions through BB. A choice belongs to one chat, not to every chat in the project.

## Supported providers

| BB provider | Discovery | Session selection |
| --- | --- | --- |
| Claude Code (`claude-code`) | User/project agent Markdown files and enabled installed Claude plugins | Native `--agent` argument |
| Codex (`codex`) | `$CODEX_HOME/NAME.config.toml` profiles (Codex 0.134+) | `developer_instructions` through BB, up to 4096 characters |
| OpenCode (`acp-opencode`) | `opencode agent list`, primary/all agents | Native `default_agent` in the ACP process configuration |

OpenCode's internal compaction, summary and title agents and subagent-only roles are excluded. Other BB providers are not currently supported. Codex support applies profile instructions only: model, permission, hooks, MCP and other profile configuration are not applied. Profiles without developer_instructions or over the 4096-character BB limit cannot be selected.

Requires **BB 0.43.x / Plugin SDK 0.4.84+**, macOS or Linux, and a supported CLI installed and authenticated on the execution machine. The first release supports project checkouts and existing environments. Choose/create a worktree before using the picker; creating a new worktree and choosing its agent in one submission is not supported. Compact/mobile composers currently do not render BB's plugin action slot.

## Install locally

```sh
npm ci
npm run build
bb plugin install .
```

For development: `bb plugin dev`. Release artifacts in `dist/` contain server, frontend and remote-host bundles. The remote machine does not need the source checkout or this plugin's npm dependencies.

## Use

1. Choose a project, existing environment/machine, and Claude Code, Codex or OpenCode in BB.
2. Open **Agent** (or **Profile** for Codex) in the composer action row and search the available agents.
3. Choose one. BB inserts an **Agent: …** mention into the first message; it carries the selection through the native submission pipeline.
4. Send your request normally. The agent identity stays with this chat, including subsequent turns and plugin reloads.

Before sending, select another agent to replace the mention or choose **Use default agent**. If you switch the machine, project, CLI or workspace after choosing an agent, select again. An incompatible selection is rejected before dispatch rather than silently starting the default agent. Existing conversations cannot change role through the picker.

The search reads agent metadata without exposing full instruction bodies. Codex profile developer instructions are transferred to BB and stored per thread for reload persistence; Claude and OpenCode instruction bodies remain managed by their CLIs. Claude plugin names retain their namespace, for example `lane-stack:dev-orchestrator`. Changes to agent instructions in an existing session follow the CLI's own persistence rules; start a new chat to guarantee fresh instructions.

## Codex profiles

Create `~/.codex/reviewer.config.toml` (or in `CODEX_HOME`):

```toml
developer_instructions = "Review changes for bugs and regressions. Explain concrete findings."
```

Codex app-server rejects `--profile`, and BB 0.43 does not expose per-thread app-server launch overrides. This adapter uses BB’s public instruction contribution API; it does not claim to activate the complete native configuration profile. Instructions remain scoped to the selected conversation. Start a new chat after editing a profile to load fresh instructions.

## CLI

```sh
bb cli-agents list claude-code HOST_ID PROJECT_ID
bb cli-agents list acp-opencode HOST_ID PROJECT_ID
bb cli-agents select claude-code HOST_ID PROJECT_ID AGENT_ID
bb cli-agents thread THREAD_ID
```

Commands return bounded JSON. `select` returns a marker that can accompany a new `bb thread spawn --prompt` request using the same project, machine and provider. It does not start a session by itself. `--json` is accepted for scripting consistency.

## Implementation and limits

- All discovery and launcher preparation run through typed BB host RPC on the selected machine. No SSH configuration is required.
- A durable selection token travels in the first message's plugin mention. The dispatch hook validates project, provider, machine and workspace and checks that the agent still exists. Separate tabs do not share a mutable selection.
- Claude uses a plugin-owned executable shim selected with `BB_CLAUDE_CODE_EXECUTABLE`. It passes the agent as a literal argument and preserves BB's remaining arguments, permission mode and model.
- Stock OpenCode ACP uses a plugin-owned PATH shim. It merges `default_agent` into existing `OPENCODE_CONFIG_CONTENT`, preserves other configuration fields and restores PATH before launching the real CLI. Custom ACP definitions that launch an absolute executable or override PATH are not supported.
- No user/project CLI settings or agent files are modified. Launchers are stored in BB's host-side plugin data directory. Selection metadata is stored in the plugin's BB key-value store.
- The picker reads BB 0.43's remembered-selection keys (sessionStorage first, localStorage fallback) because the public composer hook does not expose the execution tuple. This internal read-only integration is version-bounded and tested. It does not patch BB files or intercept requests.
- Windows, managed policy-only Claude agent locations, ad hoc terminal `--plugin-dir` arguments and arbitrary shell aliases are not supported by discovery in this version.
- Listing may load the CLI's normal project configuration/plugins. Model calls use your existing provider subscription or API account. The plugin has no separate service, telemetry or account.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Tests exercise native argv/config propagation, metadata parsing, primary-agent filtering, target isolation, missing-agent rejection and binding persistence. See `docs/ADAPTERS.md` for adding a provider and `marketplace/README.md` for release preparation status.

Native references: [Claude CLI](https://code.claude.com/docs/en/cli-reference), [OpenCode agents](https://opencode.ai/docs/agents/), [OpenCode CLI](https://opencode.ai/docs/cli/).

## License

MIT. BB-generated UI sources retain their upstream provenance.
