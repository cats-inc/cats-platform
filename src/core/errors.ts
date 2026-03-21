export class CoreApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class CoreValidationError extends CoreApiError {
  constructor(message: string, code = 'bad_request') {
    super(message, code, 400);
  }
}

export class CoreNotFoundError extends CoreApiError {
  constructor(message: string, code = 'not_found') {
    super(message, code, 404);
  }
}

export class CoreConflictError extends CoreApiError {
  constructor(message: string, code = 'conflict') {
    super(message, code, 409);
  }
}
