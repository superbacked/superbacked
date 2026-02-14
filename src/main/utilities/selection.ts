export type SelectionWithElement = {
  element: HTMLTextAreaElement
  start: number
  end: number
}

export const captureSelection = (): SelectionWithElement => {
  const activeElement = document.activeElement as HTMLTextAreaElement
  const [start, end] = [
    activeElement.selectionStart,
    activeElement.selectionEnd,
  ]
  return {
    element: activeElement,
    start: start,
    end: end,
  }
}

export const restoreSelection = (selection: SelectionWithElement) => {
  selection.element.focus()
  selection.element.setSelectionRange(selection.start, selection.end)
}

export const insertAtCursor = (text: string) => {
  const activeElement = document.activeElement as HTMLTextAreaElement
  // const [start, end] = [activeElement.selectionStart, activeElement.selectionEnd]
  // activeElement.setRangeText(text, start, end, "end")
  // form.setFieldValue("secret1", activeElement.value)
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.execCommand("insertText", false, text)
  const event = new Event("change", { bubbles: true })
  activeElement.dispatchEvent(event)
  activeElement.blur()
  activeElement.focus()
}
