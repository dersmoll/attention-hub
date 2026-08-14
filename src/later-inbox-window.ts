import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";
import {
  LATER_INBOX_OPEN_EVENT,
  LATER_INBOX_WINDOW_GEOMETRY,
  type LaterInboxReturnWindow,
} from "./later-inbox-model";

export async function openLaterInboxWindow(
  onError?: (message: string) => void,
  returnFocusWindow: LaterInboxReturnWindow = "main",
) {
  const existing = await WebviewWindow.getByLabel("later");
  if (existing) {
    await existing.show();
    await existing.setFocus();
    await emitTo("later", LATER_INBOX_OPEN_EVENT, { returnFocusWindow });
    return;
  }

  const later = new WebviewWindow("later", {
    url: `/?laterReturn=${returnFocusWindow}`,
    title: "Attention Hub - Later Inbox",
    ...LATER_INBOX_WINDOW_GEOMETRY,
    center: true,
  });
  later.once("tauri://error", ({ payload }) => {
    onError?.(`Later Inbox window failed: ${String(payload)}`);
  });
}
