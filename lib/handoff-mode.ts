/** BB 0.43 has no public ComposerView flag for “Handoff to new thread”.
 * The panel is still scope.kind "thread". Detect it from the composer form.
 * No language-independent attribute was found in SDK 0.4.84; match en+ru
 * labels from the live panel (AG-87). Breaks if BB renames those buttons.
 */
const HANDOFF_LABEL =
  /exit handoff|create new thread|выйти из передачи|создать новый тред|отменить передачу/iu;

export function isHandoffComposer(
  element: Element | Document | null | undefined,
): boolean {
  const form =
    element &&
    typeof (element as Element).closest === "function"
      ? (element as Element).closest("form")
      : element &&
          typeof (element as Document).querySelector === "function" &&
          !(element as Element).closest
        ? (element as Document).querySelector("form")
        : null;
  if (!form) return false;
  for (const node of Array.from(form.querySelectorAll("button, [role='button']"))) {
    const text = [
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.textContent,
    ]
      .filter(Boolean)
      .join(" ");
    if (HANDOFF_LABEL.test(text)) return true;
  }
  return false;
}
