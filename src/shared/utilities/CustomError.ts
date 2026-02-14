export default class CustomError<
  TMessage extends string = string,
> extends Error {
  public readonly message: TMessage

  constructor(message: TMessage) {
    super(message)
    this.message = message
    this.name = "CustomError"

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError)
    }
  }
}
