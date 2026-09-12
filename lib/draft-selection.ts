import type { ComposerStructuredDraft, ComposerView } from "@get-bb/plugin-sdk";
export type DraftState = {
  projectId: string | null;
  draft: ComposerStructuredDraft;
};
let state: DraftState = { projectId: null, draft: { text: "", mentions: [] } };
const listeners = new Set<() => void>();
export const subscribeDraft = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export const getDraft = () => state;
export function observeDraft(
  draft: ComposerStructuredDraft,
  view: ComposerView,
) {
  if (view.scope.kind !== "new-thread") return;
  state = { projectId: view.scope.projectId, draft };
  for (const f of listeners) f();
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
