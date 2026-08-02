import { notifications } from "@mantine/notifications"
import { t } from "i18next"

import { defaultClipboardClearSeconds } from "@/src/shared/utilities/clipboard"

// Copy a secret and schedule its deferred clearing — the write stays in
// the renderer (navigator.clipboard needs only a focused window, no
// helper process), while the conditional clear runs in the main process
// (see src/handlers/scheduleClipboardClear.ts), where the timer
// survives navigation and window close. The toast announces the wipe up
// front — same wording as the command-line interface’s clear flow — so
// the clipboard never clears by surprise.
export const copySecretText = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text)
  await window.api.invoke.scheduleClipboardClear(text)
  const seconds =
    window.api.invokeSync.getConfig("clipboardClearSeconds") ??
    defaultClipboardClearSeconds
  notifications.show({
    id: "copy",
    message: t("common.copiedToClipboard", { count: seconds }),
  })
}
