// Operational error carrying an HTTP status and a stable machine code.
// Thrown from controllers/services; caught by the central error handler.
export class ApiError extends Error {
  constructor(statusCode, message, errorCode = 'ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', code = 'BAD_REQUEST') {
    return new ApiError(400, msg, code);
  }
  static unauthorized(msg = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new ApiError(401, msg, code);
  }
  static forbidden(msg = 'Forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, msg, code);
  }
  static notFound(msg = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, msg, code);
  }
  static conflict(msg = 'Conflict', code = 'CONFLICT') {
    return new ApiError(409, msg, code);
  }
}
