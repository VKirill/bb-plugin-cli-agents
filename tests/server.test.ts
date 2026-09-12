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
async function setup() {
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
function context(threadId: string, text: string, hostId = "host_a") {
  return makeMessageDispatchHookContext({
    thread: { id: threadId, projectId: "project_a", providerId: "claude-code" },
    project: { id: "project_a" },
    host: { id: hostId },
    environment: { hostId, projectId: "project_a", path: "/workspace" },
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
