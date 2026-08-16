// Operational error carrying an HTTP status and a stable machine code.
// Thrown from controllers/services; caught by the central error handler.
export class ApiError extends Error {
  constructor(statusCode, message, errorCode = 'ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', code = 'BAD_REQUEST', details) {
    return new ApiError(400, msg, code, details);
  }
  static unauthorized(msg = 'Unauthorized', code = 'UNAUTHORIZED', details) {
    return new ApiError(401, msg, code, details);
  }
  static forbidden(msg = 'Forbidden', code = 'FORBIDDEN', details) {
    return new ApiError(403, msg, code, details);
  }
  static notFound(msg = 'Not found', code = 'NOT_FOUND', details) {
    return new ApiError(404, msg, code, details);
  }
  static conflict(msg = 'Conflict', code = 'CONFLICT', details) {
    return new ApiError(409, msg, code, details);
  }
}
