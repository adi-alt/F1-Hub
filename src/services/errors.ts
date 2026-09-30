/** One error shape both services throw for auth/validation failures, so route handlers (and
 * Server Components) have one consistent thing to catch and translate, instead of each service
 * inventing its own convention.
 *
 * `code` is an optional stable, machine-readable reason ("prediction_locked", "request_required")
 * for the few cases where the UI must react differently from just showing the message - the message
 * is for people and may change, the code is for the client and must not. */
export class ServiceError extends Error {
  httpStatus: number;
  code?: string;
  constructor(message: string, httpStatus: number, code?: string) {
    super(message);
    this.name = "ServiceError";
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** The JSON body a route handler should return for a ServiceError. */
export function serviceErrorBody(err: ServiceError): { error: string; code?: string } {
  return err.code ? { error: err.message, code: err.code } : { error: err.message };
}
