import type { Target } from "../contract";
/** BB 0.43 remembered-selection contract. Read only, never writes native keys.
 * sessionStorage takes precedence so different tabs keep independent targets.
 * There is currently no public composer hook exposing machine/provider selection.
 */
export function readTarget(
  projectId: string | null,
  session: Pick<Storage, "getItem">,
  local: Pick<Storage, "getItem">,
  defaults: { hostId: string; providerId: string } | null = null,
): Target | null {
  if (!projectId) return null;
  const read = (key: string) =>
    session.getItem(key) ?? local.getItem(key) ?? "";
  const providerId =
    read("bb.promptbox.provider") || defaults?.providerId || "";
  if (
    providerId !== "claude-code" &&
    providerId !== "acp-opencode" &&
    providerId !== "codex"
  )
    return null;
  const suffix = `-${encodeURIComponent(projectId)}-1`;
  const hostId =
    read("bb.promptbox.machine" + suffix) || defaults?.hostId || "";
  if (!hostId || !hostId.startsWith("host_")) return null;
  const env = read("bb.promptbox.environment" + suffix);
  if (
    env.startsWith("provider:") &&
    !["provider:project-checkout"].includes(env)
  )
    return null;
  return {
    projectId,
    hostId,
    providerId,
    environmentId: env.startsWith("reuse:") ? env.slice(6) : null,
  };
}
