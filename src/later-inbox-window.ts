import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openLaterInboxWindow(
  onError?: (message: string) => void,
) {
  const existing = await WebviewWindow.getByLabel("later");
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const later = new WebviewWindow("later", {
    url: "/",
    title: "Attention Hub - Later Inbox",
    width: 420,
    height: 520,
    minWidth: 360,
    minHeight: 420,
    center: true,
  });
  later.once("tauri://error", ({ payload }) => {
    onError?.(`Later Inbox window failed: ${String(payload)}`);
  });
}
