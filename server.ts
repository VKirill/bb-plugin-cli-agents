import { randomUUID } from "node:crypto";
import type {
  BbPluginApi,
  ExperimentalPluginProviderEnvEntry,
} from "@get-bb/plugin-sdk";
import {
  hostContract,
  rpcContract,
  providerSchema,
  selectionSchema,
  targetSchema,
  type Target,
  type Selection,
} from "./contract";
export const marker = (token: string) => `[cli-agents-selection:${token}]`;
export function tokensFrom(value: unknown): string[] {
  return [
    ...new Set(
      [
        ...JSON.stringify(value).matchAll(
          /\[cli-agents-selection:([0-9a-f-]{36})\]/g,
        ),
      ].map((m) => m[1]!),
    ),
  ];
}
export default async function plugin(bb: BbPluginApi) {
  const profileInstructions = new Map<string, string>();
  for (const key of await bb.storage.kv.list("instructions:")) {
    const text = await bb.storage.kv.get<string>(key);
    if (typeof text === "string" && text.length <= 4096)
      profileInstructions.set(key.slice(13), text);
  }
  bb.agents.contributeInstructions(
    ({ threadId }) => profileInstructions.get(threadId) ?? null,
  );
  const host = bb.hosts.experimental_client({ contract: hostContract });
  async function resolveTarget(target: Target) {
    const machine = await bb.sdk.hosts.get({ hostId: target.hostId });
    if (machine.status !== "connected")
      throw new Error("Selected machine is offline.");
    const project = await bb.sdk.projects.get({ projectId: target.projectId });
    if (target.environmentId) {
      const env = await bb.sdk.environments.get({
        environmentId: target.environmentId,
      });
      if (
        env.projectId !== target.projectId ||
        env.hostId !== target.hostId ||
        !env.path
      )
        throw new Error(
          "Selected environment does not match the machine and project.",
        );
      return env.path;
    }
    const source = project.sources.find((s) => s.hostId === target.hostId);
    if (!source)
      throw new Error("This project has no checkout on the selected machine.");
    return source.path;
  }
  const binding = async (threadId: string) => {
    const v = await bb.storage.kv.get<Selection>(`thread:${threadId}`);
    return v ? selectionSchema.parse(v) : null;
  };
  async function catalog(target: Target) {
    return host.call(
      "discover",
      { providerId: target.providerId, cwd: await resolveTarget(target) },
      { hostId: target.hostId },
    );
  }
  async function select(target: Target, agentId: string) {
    const cwd = await resolveTarget(target);
    const found = await host.call(
      "discover",
      { cwd, providerId: target.providerId },
      { hostId: target.hostId },
    );
    if (!found.supported || !found.agents.some((a) => a.id === agentId))
      throw new Error("Agent is not available. Refresh the list.");
    const s: Selection = {
      ...target,
      cwd,
      agentId,
      token: randomUUID(),
      createdAt: Date.now(),
    };
    await bb.storage.kv.set(`selection:${s.token}`, s);
    return { token: s.token, label: `Agent: ${agentId}` };
  }
  // Starred agents float to the top of the picker; kept per CLI for every machine.
  async function favorites(providerId: string) {
    const stored = await bb.storage.kv.get<string[]>(`favorites:${providerId}`);
    return Array.isArray(stored)
      ? stored.filter((id) => typeof id === "string").slice(0, 200)
      : [];
  }
  bb.rpc.register(rpcContract, {
    defaults: async ({ projectId }) => {
      const project = await bb.sdk.projects.get({ projectId });
      const defaults = await bb.sdk.projects.defaultExecutionOptions({
        projectId,
      });
      return {
        hostId:
          (project.sources.find((s) => s.isDefault) ?? project.sources[0])
            ?.hostId ?? "",
        providerId: defaults?.providerId ?? "",
      };
    },
    catalog,
    select: ({ agentId, ...target }) => select(target, agentId),
    thread: ({ threadId }) => binding(threadId),
    favorites: ({ providerId }) => favorites(providerId),
    favorite: async ({ providerId, agentId, pinned }) => {
      const rest = (await favorites(providerId)).filter((id) => id !== agentId);
      const next = pinned ? [...rest, agentId].slice(-200) : rest;
      await bb.storage.kv.set(`favorites:${providerId}`, next);
      return next;
    },
  });
  bb.ui.registerMentionProvider({
    id: "selection",
    label: "CLI Agents",
    search: () => [],
    resolve: async (token) => {
      const s = await bb.storage.kv.get<Selection>(`selection:${token}`);
      if (!s)
        throw new Error("Agent selection is missing. Choose the agent again.");
      return {
        context:
          s.providerId === "codex"
            ? `${marker(token)}\nCodex instruction profile selected: ${s.agentId}. CLI Agents contributes its developer instructions through BB; other profile settings are not applied.`
            : `${marker(token)}\nNative session agent selected: ${s.agentId}. CLI Agents applies this identity at process startup.`,
      };
    },
  });
  // Mentions carry each choice through native submission, avoiding cross-tab races.
  bb.experimental_hooks.on("message.dispatch", async (ctx) => {
    try {
      const isSupportedProvider = (
        providerSchema.options as readonly string[]
      ).includes(ctx.requestedExecution.providerId);
      if (!isSupportedProvider) {
        // This CLI provider does not support session agents or profiles; do not pass anything
        return { action: "proceed" };
      }
      const tokens = tokensFrom(ctx.input.blocks);
      if (tokens.length > 1)
        throw new Error("Select one session agent per chat.");
      let selected = await binding(ctx.thread.id);
      if (tokens.length) {
        const candidate = await bb.storage.kv.get<Selection>(
          `selection:${tokens[0]}`,
        );
        if (!candidate)
          throw new Error("Agent selection is missing. Choose it again.");
        if (selected && selected.token !== candidate.token)
          throw new Error(
            "The session agent is fixed for this chat. Start a new chat to choose another agent.",
          );
        selected = selectionSchema.parse(candidate);
      }
      if (!selected) return { action: "proceed" };
      if (selected.providerId !== ctx.requestedExecution.providerId) {
        // Selection belongs to another CLI; do not pass it to this CLI
        return { action: "proceed" };
      }
      if (
        selected.projectId !== ctx.project.id ||
        selected.hostId !== ctx.host?.id
      )
        throw new Error(
          "The agent belongs to a different machine or project. Remove the Agent mention and choose it again.",
        );
      if (ctx.environment?.path && ctx.environment.path !== selected.cwd)
        throw new Error(
          "The workspace changed. Choose an agent in the target workspace before starting this chat.",
        );
      const prepared = await host.call(
        "prepare",
        {
          cwd: selected.cwd,
          providerId: selected.providerId,
          agentId: selected.agentId,
        },
        { hostId: selected.hostId },
      );
      if (selected.providerId === "codex") {
        const instructions = await host.call(
          "instructions",
          { agentId: selected.agentId },
          { hostId: selected.hostId },
        );
        await bb.storage.kv.set(`instructions:${ctx.thread.id}`, instructions);
        profileInstructions.set(ctx.thread.id, instructions);
      }
      await bb.storage.kv.set(`thread:${ctx.thread.id}`, selected);
      await bb.storage.kv.set(`env:${ctx.thread.id}`, prepared);
      return { action: "proceed" };
    } catch (e) {
      return {
        action: "reject",
        message: `CLI Agents: ${(e as Error).message}`,
      };
    }
  });
  for (const provider of ["claude-code", "acp-opencode"])
    bb.providers.experimental_contributeEnv(provider, async (ctx) => {
      const s = await binding(ctx.threadId);
      if (!s || s.providerId !== provider || s.hostId !== ctx.hostId) return [];
      return (
        (await bb.storage.kv.get<ExperimentalPluginProviderEnvEntry[]>(
          `env:${ctx.threadId}`,
        )) ?? []
      );
    });
  bb.cli.register({
    name: "cli-agents",
    summary: "Discover and select native CLI session agents on BB machines",
    commands: [
      {
        name: "list",
        summary: "List agents in a project checkout",
        usage: "bb cli-agents list PROVIDER HOST_ID PROJECT_ID",
      },
      {
        name: "select",
        summary: "Prepare a selection marker for a new chat",
        usage: "bb cli-agents select PROVIDER HOST_ID PROJECT_ID AGENT",
      },
      {
        name: "thread",
        summary: "Show the agent bound to a chat",
        usage: "bb cli-agents thread THREAD_ID",
      },
    ],
    async run(argv) {
      try {
        const [cmd, providerId, hostId, projectId, agentId] = argv.filter(
          (a) => a !== "--json",
        );
        let result: unknown;
        if (cmd === "thread" && providerId) result = await binding(providerId);
        else {
          const target = targetSchema.parse({ providerId, hostId, projectId });
          if (cmd === "list") result = await catalog(target);
          else if (cmd === "select" && agentId) {
            const s = await select(target, agentId);
            result = { ...s, marker: marker(s.token) };
          } else
            throw new Error(
              "Usage: bb cli-agents list|select PROVIDER HOST_ID PROJECT_ID [AGENT], or thread THREAD_ID",
            );
        }
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2) };
      } catch (e) {
        return { exitCode: 1, stderr: (e as Error).message };
      }
    },
  });
}
