import type { ComposerStructuredDraft, ComposerView } from "@get-bb/plugin-sdk";
import { isHandoffComposer } from "./handoff-mode";
export type DraftState = {
  projectId: string | null;
  draftKey: string | null;
  draft: ComposerStructuredDraft;
};
let state: DraftState = {
  projectId: null,
  draftKey: null,
  draft: { text: "", mentions: [] },
};
const listeners = new Set<() => void>();
export const subscribeDraft = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export const getDraft = () => state;
export function composerDraftKey(view: ComposerView): string | null {
  if (view.scope.kind === "new-thread")
    return `new-thread:${view.scope.projectId ?? ""}`;
  if (view.scope.kind === "thread") return `handoff:${view.scope.threadId}`;
  return null;
}
export function observeDraft(
  draft: ComposerStructuredDraft,
  view: ComposerView,
) {
  if (view.scope.kind === "new-thread") {
    state = {
      projectId: view.scope.projectId,
      draftKey: composerDraftKey(view),
      draft,
    };
    for (const f of listeners) f();
    return;
  }
  if (
    view.scope.kind === "thread" &&
    typeof document !== "undefined" &&
    isHandoffComposer(document)
  ) {
    state = {
      projectId: state.projectId,
      draftKey: composerDraftKey(view),
      draft,
    };
    for (const f of listeners) f();
  }
}
export function ownMentions(draft: ComposerStructuredDraft) {
  return draft.mentions.filter(
    (m) => m.provider === "selection" && m.label.startsWith("Agent: "),
  );
}
export function removeSelection(text: string, draft: ComposerStructuredDraft) {
  if (text !== draft.text)
    throw new Error("The draft is still updating. Please try again.");
  let result = text;
  for (const m of [...ownMentions(draft)].sort((a, b) => b.from - a.from))
    result = result.slice(0, m.from) + result.slice(m.to);
  return result;
}
export function cleanSelectionText(text: string): string {
  return text.trimEnd().replace(/(\s*Agent:\s+[^\s]+)+$/gu, "").trimEnd();
}
export function cleanSelection(
  text: string,
  draft?: ComposerStructuredDraft,
): string {
  let result = text;
  if (draft && draft.mentions.length > 0) {
    for (const m of [...ownMentions(draft)].sort((a, b) => b.from - a.from)) {
      if (m.from >= 0 && m.to <= result.length && m.from <= m.to) {
        result = result.slice(0, m.from) + result.slice(m.to);
      }
    }
  }
  return cleanSelectionText(result);
}
