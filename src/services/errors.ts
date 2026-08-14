/** One error shape both services throw for auth/validation failures, so route handlers (and
 * Server Components) have one consistent thing to catch and translate, instead of each service
 * inventing its own convention. */
export class ServiceError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "ServiceError";
    this.httpStatus = httpStatus;
  }
}
