// Styling for text bound for stderr — applied only when stderr is a
// terminal and NO_COLOR is unset, so piped output and opted-out
// environments stay clean

// Bold text — advisories that must not be skimmed past
export const bold = (text: string): string => {
  if (process.stderr.isTTY === true && process.env.NO_COLOR === undefined) {
    return `\x1b[1m${text}\x1b[0m`
  }
  return text
}

// Bold red text — destructive warnings and errors
export const red = (text: string): string => {
  if (process.stderr.isTTY === true && process.env.NO_COLOR === undefined) {
    return `\x1b[1;31m${text}\x1b[0m`
  }
  return text
}
