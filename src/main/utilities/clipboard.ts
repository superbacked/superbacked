import { notifications } from "@mantine/notifications"
import { t } from "i18next"

import { defaultClipboardClearSeconds } from "@/src/shared/clipboardClearSeconds"

// Copy a secret and schedule its deferred clearing — the write stays in
// the renderer (navigator.clipboard needs only a focused window, no
// helper process), while the conditional clear runs in the main process
// (see src/handlers/scheduleClipboardClear.ts), where the timer
// survives navigation and window close. Scheduling precedes the write:
// when no clear can be established, its rejection lands here before
// anything is on the clipboard — the toast would otherwise announce a
// wipe that cannot happen. The pending clear is conditional on the
// clipboard still holding the text, so it stays a no-op should the
// write itself fail. The toast announces the wipe up front — same
// wording as the command-line interface’s clear flow — so the clipboard
// never clears by surprise.
export const copySecretText = async (text: string): Promise<void> => {
  await window.api.invoke.scheduleClipboardClear(text)
  await navigator.clipboard.writeText(text)
  const seconds =
    window.api.invokeSync.getConfig("clipboardClearSeconds") ??
    defaultClipboardClearSeconds
  notifications.show({
    id: "copy",
    message: t("common.copiedToClipboard", { count: seconds }),
  })
}
