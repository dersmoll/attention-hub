import { createAuxiliaryWindow, findAuxiliaryWindow, waitForAuxiliaryWindowVisible, withAuxiliaryWindowDeadline } from "./auxiliary-window";
import { auxiliaryWindowFailureMessage } from "./auxiliary-window-lifecycle";
import { TODO_POPUP_WINDOW_LABEL, type TodoPopupPayload } from "./todo-popup-model";

export { medicinePanelPosition as todoPopupPosition } from "./medicine-panel-window";
import { medicinePanelPosition as todoPopupPosition } from "./medicine-panel-window";

export async function createTodoPopupWindow(
  payload: TodoPopupPayload,
  onPositioned: () => void,
  onClosed: () => void,
  onError?: (message: string) => void,
) {
  try {
    const existing = await findAuxiliaryWindow(TODO_POPUP_WINDOW_LABEL);
    if (existing) {
      throw new Error("To-dos popup is already open.");
    }
    const popup = await createAuxiliaryWindow(TODO_POPUP_WINDOW_LABEL, {
      url: "/?window=todo-popup",
      title: "Attention Hub - To-dos",
      width: payload.width,
      height: payload.height,
      decorations: false,
      resizable: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
    });
    await withAuxiliaryWindowDeadline(TODO_POPUP_WINDOW_LABEL, async () => {
      await popup.once("tauri://destroyed", onClosed);
      await popup.setPosition(todoPopupPosition(payload));
      onPositioned();
      await waitForAuxiliaryWindowVisible(popup);
    });
  } catch {
    onClosed();
    const message = auxiliaryWindowFailureMessage(TODO_POPUP_WINDOW_LABEL);
    onError?.(message);
    throw new Error(message);
  }
}
