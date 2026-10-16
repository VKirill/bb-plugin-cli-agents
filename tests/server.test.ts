import { it, expect, afterEach } from "vitest";
import {
  createFakePluginHost,
  makeMessageDispatchHookContext,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin, { marker } from "../server";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const f of cleanup.splice(0)) await f();
});
async function setup(agentsIn: (cwd: string) => boolean = () => true) {
  let available = true;
  const fake = createFakePluginHost({
    pluginId: "cli-agents",
    sdk: {
      hosts: {
        get: async () => ({
          ...makeHostResponse(),
          id: "host_a",
          status: "connected",
          connectMachineId: null,
        }),
      },
      threads: {
        get: async ({ threadId }: { threadId: string }) => ({
          id: threadId,
          projectId: "project_a",
        }),
      },
      projects: {
        get: async () => ({
          id: "project_a",
          name: "Example",
          kind: "standard",
          gitRemoteUrl: null,
          createdAt: 0,
          updatedAt: 0,
          sources: [
            {
              id: "source_a",
              projectId: "project_a",
              hostId: "host_a",
              path: "/workspace",
              isDefault: true,
              type: "local_path",
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        }),
      },
    },
    experimental_callHostRpc: async ({ method, input }) => {
      const cwd = (input as { cwd?: string }).cwd ?? "";
      if (method === "prepare" && !agentsIn(cwd))
        throw new Error(`Agent reviewer is not available in ${cwd}.`);
      if (method === "discover")
        return {
          agents: [
            {
              id: "reviewer",
              description: "Reviews",
              source: "user",
              mode: "primary",
            },
          ],
          version: "test",
          warnings: [],
          supported: true,
        };
      if (!available) throw new Error("Agent removed");
      if (method === "instructions") return "Profile instruction";
      return [
        {
          name: "BB_CLAUDE_CODE_EXECUTABLE",
          value: "/launcher",
          reason: "test",
        },
      ];
    },
  });
  await plugin(fake.bb);
  cleanup.push(() => fake.harness.lifecycle.dispose());
  return {
    ...fake,
    removeAgent: () => {
      available = false;
    },
  };
}
const target = {
  projectId: "project_a",
  hostId: "host_a",
  providerId: "claude-code",
  environmentId: null,
};
function context(
  threadId: string,
  text: string,
  hostId = "host_a",
  path = "/workspace",
) {
  return makeMessageDispatchHookContext({
    thread: { id: threadId, projectId: "project_a", providerId: "claude-code" },
    project: { id: "project_a" },
    host: { id: hostId },
    environment: { hostId, projectId: "project_a", path },
    requestedExecution: { providerId: "claude-code" },
    input: { text, blocks: [{ type: "text", text, mentions: [] }] },
  });
}
it("binds a selection to one thread, survives reload, and leaves unrelated threads untouched", async () => {
  const fake = await setup();
  const selected = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  expect(await hook(context("thread_a", marker(selected.token)))).toEqual({
    action: "proceed",
  });
  expect(
    await fake.harness.behavior.resolveProviderEnv("claude-code", {
      threadId: "thread_a",
      hostId: "host_a",
      projectId: "project_a",
    }),
  ).toHaveLength(1);
  expect(
    await fake.harness.behavior.resolveProviderEnv("claude-code", {
      threadId: "thread_b",
      hostId: "host_a",
      projectId: "project_a",
    }),
  ).toEqual([]);
  const loaded = await fake.harness.lifecycle.reload(plugin);
  cleanup.push(() => loaded.harness.lifecycle.dispose());
  expect(
    await loaded.harness.behavior.callRpc("thread", { threadId: "thread_a" }),
  ).toMatchObject({ agentId: "reviewer" });
});
it("rejects a selection from another machine and missing or multiple selections", async () => {
  const fake = await setup();
  const { token } = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  expect(await hook(context("t", marker(token), "host_b"))).toMatchObject({
    action: "reject",
  });
  expect(
    await hook(context("t", marker("00000000-0000-0000-0000-000000000000"))),
  ).toMatchObject({ action: "reject" });
  expect(
    await hook(
      context(
        "t",
        marker(token) + marker("00000000-0000-0000-0000-000000000000"),
      ),
    ),
  ).toMatchObject({ action: "reject" });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "t" }),
  ).toBeNull();
});
it("fails before dispatch if an agent disappears rather than running the default agent", async () => {
  const fake = await setup();
  const { token } = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  fake.removeAgent();
  expect(
    await fake.harness.registrations.hooks["message.dispatch"]!(
      context("t", marker(token)),
    ),
  ).toMatchObject({ action: "reject", message: "CLI Agents: Agent removed" });
});

it("injects Codex instructions only into the bound thread and rehydrates them on reload", async () => {
  const f = await setup();
  const selected = (await f.harness.behavior.callRpc("select", {
    ...target,
    providerId: "codex",
    agentId: "reviewer",
  })) as { token: string };
  const ctx = context("codex_thread", marker(selected.token));
  ctx.requestedExecution.providerId = "codex";
  expect(await f.harness.registrations.hooks["message.dispatch"]!(ctx)).toEqual(
    { action: "proceed" },
  );
  expect(
    f.harness.registrations.instructionProvider!({
      threadId: "codex_thread",
      projectId: "project_a",
    }),
  ).toBe("Profile instruction");
  expect(
    f.harness.registrations.instructionProvider!({
      threadId: "other",
      projectId: "project_a",
    }),
  ).toBeNull();
  expect(await f.bb.storage.kv.get("instructions:codex_thread")).toBe(
    "Profile instruction",
  );
  const reloaded = createFakePluginHost({ pluginId: "cli-agents" });
  await reloaded.bb.storage.kv.set(
    "instructions:codex_thread",
    "Profile instruction",
  );
  await plugin(reloaded.bb);
  cleanup.push(() => reloaded.harness.lifecycle.dispose());
  expect(
    reloaded.harness.registrations.instructionProvider!({
      threadId: "codex_thread",
      projectId: "project_a",
    }),
  ).toBe("Profile instruction");
});

it("proceeds without configuring anything when execution provider does not support cli-agents (e.g. acp-cursor)", async () => {
  const fake = await setup();
  const { token } = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  const ctx = context("cursor_thread", marker(token));
  ctx.requestedExecution.providerId = "acp-cursor";
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  expect(await hook(ctx)).toEqual({ action: "proceed" });
  expect(await fake.bb.storage.kv.get("thread:cursor_thread")).toBeUndefined();
  expect(await fake.bb.storage.kv.get("env:cursor_thread")).toBeUndefined();
});

it("proceeds without configuring anything when selection belongs to a different CLI provider", async () => {
  const fake = await setup();
  const { token } = (await fake.harness.behavior.callRpc("select", {
    ...target,
    providerId: "claude-code",
    agentId: "reviewer",
  })) as { token: string };
  const ctx = context("codex_thread", marker(token));
  ctx.requestedExecution.providerId = "codex";
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  expect(await hook(ctx)).toEqual({ action: "proceed" });
  expect(await fake.bb.storage.kv.get("thread:codex_thread")).toBeUndefined();
  expect(
    await fake.bb.storage.kv.get("instructions:codex_thread"),
  ).toBeUndefined();
});


it("follows the chat into a section folder of the same project instead of rejecting later messages", async () => {
  const fake = await setup();
  const { token } = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  // The first message runs before the section workspace exists.
  expect(await hook(context("t", marker(token)))).toEqual({ action: "proceed" });
  // Later messages run in the section folder the chat was started in.
  expect(
    await hook(context("t", "second message", "host_a", "/workspace/apps/bot")),
  ).toEqual({ action: "proceed" });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "t" }),
  ).toMatchObject({ agentId: "reviewer", cwd: "/workspace/apps/bot" });
  expect(
    await hook(context("t", "third message", "host_a", "/workspace/apps/bot")),
  ).toEqual({ action: "proceed" });
});

it("rejects with a clear reason when the agent does not exist in the chat folder", async () => {
  const fake = await setup((cwd) => cwd === "/workspace");
  const { token } = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  const result = (await hook(
    context("t", marker(token), "host_a", "/elsewhere"),
  )) as { action: string; message?: string };
  expect(result.action).toBe("reject");
  expect(result.message).toContain("/elsewhere");
});

it("binds a selection from pending project state when no mention token is in the prompt", async () => {
  const fake = await setup();
  await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  });
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  // Plain message text without any [cli-agents-selection:...] token or mention
  expect(await hook(context("t_pending", "clean prompt"))).toEqual({
    action: "proceed",
  });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "t_pending" }),
  ).toMatchObject({ agentId: "reviewer" });
  // Second thread without new selection does not inherit the consumed selection
  expect(await hook(context("t_next", "another clean prompt"))).toEqual({
    action: "proceed",
  });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "t_next" }),
  ).toBeNull();
});

it("resolves the project of an existing thread for the handoff picker", async () => {
  const fake = await setup();
  expect(
    await fake.harness.behavior.callRpc("threadProject", {
      threadId: "source_thread",
    }),
  ).toEqual({ projectId: "project_a" });
});

it("binds a handoff pending selection to the new thread, not the source thread that already has an agent", async () => {
  const fake = await setup();
  const first = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  expect(await hook(context("source_thread", marker(first.token)))).toEqual({
    action: "proceed",
  });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "source_thread" }),
  ).toMatchObject({ agentId: "reviewer", token: first.token });

  const second = (await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  })) as { token: string };
  expect(second.token).not.toBe(first.token);
  expect(await hook(context("new_thread", "handoff prompt"))).toEqual({
    action: "proceed",
  });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "new_thread" }),
  ).toMatchObject({ agentId: "reviewer", token: second.token });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "source_thread" }),
  ).toMatchObject({ token: first.token });
  const retry = (await hook(
    context("source_thread", marker(second.token)),
  )) as { action: string; message?: string };
  expect(retry.action).toBe("reject");
  expect(retry.message).toContain("fixed for this chat");
});

it("clears pending selection when clearPending is invoked", async () => {
  const fake = await setup();
  await fake.harness.behavior.callRpc("select", {
    ...target,
    agentId: "reviewer",
  });
  expect(
    await fake.harness.behavior.callRpc("pending", {
      projectId: target.projectId,
      providerId: target.providerId,
    }),
  ).toMatchObject({ agentId: "reviewer" });

  await fake.harness.behavior.callRpc("clearPending", {
    projectId: target.projectId,
    providerId: target.providerId,
  });
  expect(
    await fake.harness.behavior.callRpc("pending", {
      projectId: target.projectId,
      providerId: target.providerId,
    }),
  ).toBeNull();

  const hook = fake.harness.registrations.hooks["message.dispatch"]!;
  expect(await hook(context("t_cleared", "prompt after clear"))).toEqual({
    action: "proceed",
  });
  expect(
    await fake.harness.behavior.callRpc("thread", { threadId: "t_cleared" }),
  ).toBeNull();
});
