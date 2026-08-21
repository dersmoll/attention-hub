import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/window";
import {
  LATER_INBOX_OPEN_EVENT,
  LATER_INBOX_WINDOW_GEOMETRY,
  type LaterInboxOpenPayload,
  type LaterInboxReturnWindow,
} from "./later-inbox-model";

export async function openLaterInboxWindow(
  onError?: (message: string) => void,
  returnFocusWindow: LaterInboxReturnWindow = "main",
  options: Pick<LaterInboxOpenPayload, "prefillFollowUpAt"> = {},
) {
  const payload: LaterInboxOpenPayload = { returnFocusWindow, ...options };
  const existing = await WebviewWindow.getByLabel("later");
  if (existing) {
    await existing.setMinSize(
      new LogicalSize(
        LATER_INBOX_WINDOW_GEOMETRY.minWidth,
        LATER_INBOX_WINDOW_GEOMETRY.minHeight,
      ),
    );
    const scaleFactor = await existing.scaleFactor();
    const currentSize = (await existing.innerSize()).toLogical(scaleFactor);
    if (
      currentSize.width < LATER_INBOX_WINDOW_GEOMETRY.width ||
      currentSize.height < LATER_INBOX_WINDOW_GEOMETRY.height
    ) {
      await existing.setSize(
        new LogicalSize(
          Math.max(currentSize.width, LATER_INBOX_WINDOW_GEOMETRY.width),
          Math.max(currentSize.height, LATER_INBOX_WINDOW_GEOMETRY.height),
        ),
      );
    }
    await existing.show();
    await existing.setFocus();
    await emitTo("later", LATER_INBOX_OPEN_EVENT, payload);
    return;
  }

  const params = new URLSearchParams({ laterReturn: returnFocusWindow });
  if (options.prefillFollowUpAt) {
    params.set("laterFollowUp", options.prefillFollowUpAt);
  }
  const later = new WebviewWindow("later", {
    url: `/?${params.toString()}`,
    title: "Attention Hub - Later Inbox",
    ...LATER_INBOX_WINDOW_GEOMETRY,
    center: true,
  });
  later.once("tauri://error", ({ payload }) => {
    onError?.(`Later Inbox window failed: ${String(payload)}`);
  });
}
