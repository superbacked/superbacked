import { compute, Payload, Qr } from "./create"

export interface Result {
  error: string
  qr: Qr
}

export default async (payload: Payload): Promise<Result> => {
  try {
    const qr = await compute(payload, payload.metadata.label)
    return {
      error: null,
      qr: qr,
    }
  } catch (error) {
    return {
      error: error.message,
      qr: null,
    }
  }
}
