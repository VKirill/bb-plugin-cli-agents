# Adding a native session-agent adapter

An adapter must both discover usable **main-session** identities and launch that identity with the CLI's native configuration. A skill, a prompt snippet, or a subagent-only definition does not qualify.

1. Verify current primary CLI documentation and the BB provider's actual launch protocol (CLI flags do not necessarily apply to ACP).
2. Add its exact BB provider ID to `providerSchema` and the environment-contributor registration in `server.ts`.
3. Add a host-side discovery function that checks CLI presence/version, resolves the selected workspace, returns bounded metadata, and excludes subagent-only/hidden internal agents. Do not return secrets or full system prompts.
4. Add a launch adapter using native CLI arguments or native session configuration. Preserve permissions, models, user configuration, stdin/stdout, signals, and existing environment values. Do not edit shared CLI settings or write to the project. Publish any limitations of provider variants.
5. Add the provider to the read-only composer compatibility module. Unsupported or unresolved targets must not expose a working-looking picker.
6. Test discovery conflicts, removed roles, two simultaneous threads, different hosts/projects, cancellation, reload, and real native agent instructions. Add a real BB session smoke check on an enrolled machine.
7. Update README, PLUGIN_OVERVIEW, engine bounds, changelog and marketplace description together.

The host contract (`contract.ts`) is the extension seam. The BB server owns selection tokens and thread binding; adapters own only native discovery and process configuration. Additional adapters must not register a replacement provider unless the existing BB provider cannot safely carry the native selection.
