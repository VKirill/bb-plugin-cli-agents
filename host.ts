import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract";
import { discover, executable } from "./adapters/discovery";
import { prepareLaunch } from "./adapters/launch";
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    discover: ({ cwd, providerId }, ctx) =>
      discover(providerId, cwd, ctx.signal),
    prepare: async ({ cwd, providerId, agentId }, ctx) => {
      const catalog = await discover(providerId, cwd, ctx.signal);
      if (!catalog.supported || !catalog.agents.some((a) => a.id === agentId))
        throw new Error(
          `Agent ${agentId} is no longer available in this workspace.`,
        );
      return prepareLaunch(
        providerId,
        agentId,
        await executable(providerId === "claude-code" ? "claude" : "opencode"),
        ctx.experimental_paths.dataDir,
      );
    },
  },
});
