import { mountSelectionPresentation } from "./lib/selection-presentation";
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import {
  definePluginApp,
  useComposer,
  useComposerView,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import * as Popover from "@radix-ui/react-popover";
import type { rpcContract, Catalog, Target } from "./contract";
import { readTarget, composerProvider } from "./lib/composer-target";
import { Icon } from "./components/ui/icon";
import {
  subscribeDraft,
  getDraft,
  observeDraft,
  ownMentions,
  removeSelection,
} from "./lib/draft-selection";
function AgentPicker() {
  const composer = useComposer();
  const view = useComposerView();
  const rpc = useRpc<typeof rpcContract>();
  const projectId =
    view.scope.kind === "new-thread" ? view.scope.projectId : null;
  const draftState = useSyncExternalStore(subscribeDraft, getDraft);
  const selected =
    draftState.projectId === projectId
      ? (ownMentions(draftState.draft)[0]?.label.slice(7) ?? "")
      : "";
  const [defaults, setDefaults] = useState<{
    hostId: string;
    providerId: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setDefaults(null);
    if (projectId)
      rpc
        .call("defaults", { projectId })
        .then((d) => {
          if (active) setDefaults(d);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, rpc]);
  const [target, setTarget] = useState<Target | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const request = useRef(0);
  const prevTargetRef = useRef<Target | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const check = () => {
      try {
        const next = readTarget(
          projectId,
          sessionStorage,
          defaults,
          composerProvider(triggerRef.current),
        );
        setTarget((old) =>
          JSON.stringify(old) === JSON.stringify(next) ? old : next,
        );
      } catch {
        setTarget(null);
      } finally {
        setInitialized(true);
      }
    };
    check();
    const timer = setInterval(check, 500);
    return () => {
      clearInterval(timer);
    };
  }, [projectId, defaults]);
  useEffect(() => {
    request.current++;
    setCatalog(null);
    setError("");
    setBusy(false);
    // Machine or CLI changed: reload this list instead of dropping the popover.
    if (open) void refresh();
  }, [target]);

  useEffect(() => {
    if (!initialized || draftState.projectId !== projectId) return;
    const mentions = ownMentions(draftState.draft);
    if (!mentions.length) {
      prevTargetRef.current = target;
      return;
    }
    const prev = prevTargetRef.current;
    if (
      !target ||
      (prev &&
        (prev.providerId !== target.providerId ||
          prev.hostId !== target.hostId ||
          prev.projectId !== target.projectId))
    ) {
      try {
        composer.updateText((text) => removeSelection(text, draftState.draft));
      } catch {}
    }
    prevTargetRef.current = target;
  }, [initialized, target, draftState, projectId, composer]);

  const refresh = async () => {
    if (!target) return;
    const generation = ++request.current;
    setBusy(true);
    setError("");
    try {
      const [c, starred] = await Promise.all([
        rpc.call("catalog", target),
        rpc.call("favorites", { providerId: target.providerId }),
      ]);
      if (generation === request.current) setFavorites(starred);
      if (generation === request.current) setCatalog(c);
    } catch (e) {
      if (generation === request.current) setError((e as Error).message);
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };
  const choose = async (agentId: string) => {
    if (!target || busy) return;
    const generation = ++request.current;
    setBusy(true);
    setError("");
    try {
      const result = await rpc.call("select", { ...target, agentId });
      if (generation !== request.current) return;
      if (selected) {
        const draft = getDraft().draft;
        composer.updateText((text) => removeSelection(text, draft));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (generation !== request.current) return;
      }
      composer.insertMention({
        provider: "selection",
        id: result.token,
        label: result.label,
      });
      prevTargetRef.current = target;
      setOpen(false);
    } catch (e) {
      if (generation === request.current) setError((e as Error).message);
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };
  const star = async (agentId: string) => {
    if (!target) return;
    const pinned = !favorites.includes(agentId);
    setFavorites((current) =>
      pinned ? [...current, agentId] : current.filter((id) => id !== agentId),
    );
    try {
      setFavorites(
        await rpc.call("favorite", {
          providerId: target.providerId,
          agentId,
          pinned,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!target) return null;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value && !catalog && !busy) void refresh();
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Choose CLI session agent"
          title="Choose a native session agent"
          className="inline-flex h-8 max-w-64 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={view.run.isSubmitting}
        >
          <span className="truncate">
            {selected || (target?.providerId === "codex" ? "Profile" : "Agent")}
          </span>
          <Icon name="ChevronDown" className="size-4 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-medium">
              {target?.providerId === "codex"
                ? "Codex profile"
                : "Session agent"}
              <span className="ml-1 font-normal text-muted-foreground">
                {target ? `· ${target.providerId}` : ""}
              </span>
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void refresh()}
              disabled={busy}
            >
              Refresh
            </button>
          </div>
          <input
            aria-label="Search agents"
            placeholder="Search agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {target?.providerId === "codex" && (
            <p className="mb-2 text-xs text-muted-foreground">
              Instructions only (up to 4096 characters). Model, permissions and
              other profile settings are not applied.
            </p>
          )}
          {error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="p-2 text-sm text-muted-foreground">
              Reading agents on the selected machine…
            </p>
          )}
          <div
            className="max-h-72 overflow-y-auto"
            role="list"
            aria-label="Available agents"
          >
            {catalog?.agents
              .filter((a) =>
                (a.id + " " + a.description)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              // Stable sort keeps each group alphabetical, starred ones on top.
              .sort(
                (a, b) =>
                  Number(favorites.includes(b.id)) -
                  Number(favorites.includes(a.id)),
              )
              .map((a) => (
                <div
                  key={a.id}
                  className="group flex items-start rounded-md hover:bg-accent"
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void choose(a.id)}
                    className="block min-w-0 flex-1 rounded-md px-2 py-2 text-left disabled:opacity-50"
                  >
                    <div className="break-words text-sm font-medium">
                      {a.id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.source}
                    </div>
                    {a.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {a.description}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={
                      favorites.includes(a.id)
                        ? `Unstar ${a.id}`
                        : `Star ${a.id}`
                    }
                    aria-pressed={favorites.includes(a.id)}
                    onClick={() => void star(a.id)}
                    className={
                      favorites.includes(a.id)
                        ? "mr-1 mt-2 rounded-md p-1 text-amber-500 hover:text-amber-600"
                        : "mr-1 mt-2 rounded-md p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    }
                  >
                    <Icon name="Star" className="size-4" />
                  </button>
                </div>
              ))}
          </div>
          {catalog && !catalog.agents.length && !busy && (
            <p className="p-2 text-sm text-muted-foreground">
              No session agents found in this workspace.
            </p>
          )}
          {catalog?.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-muted-foreground">
              {w}
            </p>
          ))}
          <p className="mt-2 border-t border-border px-1 pt-2 text-xs text-muted-foreground">
            {selected ? (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => {
                  try {
                    const draft = getDraft().draft;
                    composer.updateText((text) => removeSelection(text, draft));
                    setOpen(false);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Use default agent
              </button>
            ) : (
              "Choose once before the first message. The agent stays with this chat."
            )}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
function ThreadAgent() {
  const view = useComposerView();
  const rpc = useRpc<typeof rpcContract>();
  const [agent, setAgent] = useState("");
  const threadId = view.scope.kind === "thread" ? view.scope.threadId : null;
  useEffect(() => {
    let active = true;
    if (threadId)
      rpc
        .call("thread", { threadId })
        .then((s) => {
          if (active) setAgent(s?.agentId ?? "");
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [threadId, rpc]);
  return agent ? (
    <span
      className="px-2 text-xs text-muted-foreground"
      title="Native session agent"
    >
      {agent}
    </span>
  ) : null;
}
export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "selection-presentation",
    mount: ({ pluginId }) => mountSelectionPresentation(pluginId),
  });
  app.composer.customize({
    id: "agent-picker",
    scopes: ["new-thread"],
    richText: { onDraftChange: observeDraft },
    actions: [{ id: "agent", component: AgentPicker }],
  });
  app.composer.customize({
    id: "thread-agent",
    scopes: ["thread"],
    actions: [{ id: "agent", component: ThreadAgent }],
  });
});
