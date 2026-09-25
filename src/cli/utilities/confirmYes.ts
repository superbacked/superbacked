import { promptVisible } from "@/src/cli/utilities/readPassphrase"

// Declining a confirmation is a choice, not a failure — the typed error
// lets command catch blocks print it plain instead of red (exit stays
// non-zero so scripts still observe the cancellation)
export class CancelledError extends Error {
  constructor() {
    super("Cancelled")
  }
}

// Interactive confirmation for high-stakes actions — the prompt reads
// from the controlling terminal, and cancellation is assumed when there
// is none. The full word is required (the SSH host key convention), as a
// reflexive y must not confirm by accident
export default async (
  query: string,
  nonInteractiveError: string
): Promise<void> => {
  let answer: string
  try {
    answer = await promptVisible(query)
  } catch {
    throw new Error(nonInteractiveError)
  }
  if (answer.trim() !== "yes") {
    throw new CancelledError()
  }
}
