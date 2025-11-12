export type SelectionWithElement = {
  element: HTMLTextAreaElement
  start: number
  end: number
}

export const captureSelection = (): SelectionWithElement => {
  const element = document.activeElement as HTMLTextAreaElement
  const [start, end] = [element.selectionStart, element.selectionEnd]
  return {
    element,
    start,
    end,
  }
}

export const restoreSelection = (selection: SelectionWithElement) => {
  selection.element.focus()
  selection.element.setSelectionRange(selection.start, selection.end)
}

export const insertAtCursor = (text: string) => {
  const element = document.activeElement as HTMLTextAreaElement
  // const [start, end] = [element.selectionStart, element.selectionEnd]
  // element.setRangeText(text, start, end, "end")
  // form.setFieldValue("secret1", element.value)
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.execCommand("insertText", false, text)
  const event = new Event("change", { bubbles: true })
  element.dispatchEvent(event)
  element.blur()
  element.focus()
}
