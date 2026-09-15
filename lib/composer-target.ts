import type { Target } from "../contract";
/** BB 0.43 remembered-selection contract. Read only, never writes native keys.
 * The CLI comes from the provider chip bb renders in this very composer, so the
 * list can never disagree with what the user sees; remembered keys are only a
 * fallback before that chip is mounted. Those keys are read from sessionStorage
 * alone, because the localStorage copy is shared with every other bb window.
 * There is currently no public composer hook exposing machine/provider selection.
 */
export function readTarget(
  projectId: string | null,
  session: Pick<Storage, "getItem">,
  defaults: { hostId: string; providerId: string } | null = null,
  composerProviderId = "",
): Target | null {
  if (!projectId) return null;
  const read = (key: string) => session.getItem(key) ?? "";
  const providerId =
    composerProviderId ||
    read("bb.promptbox.provider") ||
    defaults?.providerId ||
    "";
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
/** Provider id of the composer this element sits in, or "" when not rendered yet. */
export function composerProvider(element: Element | null): string {
  const logo = element
    ?.closest("form")
    ?.querySelector("[data-provider-logo]")
    ?.getAttribute("data-provider-logo");
  return /\/providers\/([^/?]+)\/logo/.exec(logo ?? "")?.[1] ?? "";
}
