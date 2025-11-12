import { compute, Payload, Qr } from "@/src/create"

export type Result =
  | { success: false; error: string }
  | { success: true; qr: Qr }

export default async (payload: Payload): Promise<Result> => {
  try {
    const qr = await compute(payload, payload.metadata.label)
    return {
      qr: qr,
      success: true,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not duplicate block",
      success: false,
    }
  }
}
