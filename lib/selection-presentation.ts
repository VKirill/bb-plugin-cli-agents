/** Hide only this plugin's transport mentions. The dropdown remains the UI for
 * inspecting/changing selection; the native structured draft is left intact.
 * BB 0.43 emits these resource attributes in both editor and message pills.
 */
export function mountSelectionPresentation(pluginId: string) {
  const style = document.createElement("style");
  style.dataset.cliAgentsPresentation = "selection";
  const owner = JSON.stringify(`"pluginId":"${pluginId}"`);
  const item = JSON.stringify('"itemId":"selection:');
  style.textContent = `[data-prompt-mention-resource*=${owner}][data-prompt-mention-resource*=${item}] { display: none !important; }`;
  document.head.append(style);
  return () => style.remove();
}
