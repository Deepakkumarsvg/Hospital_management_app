import { ApiError } from '../utils/ApiError.js';

// 404 for unmatched routes.
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

// Central error handler — the ONLY place that formats error responses.
// Never leaks stack traces to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errorCode = err.errorCode || 'SERVER_ERROR';

  // Mongoose: bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    errorCode = 'INVALID_ID';
  }

  // Mongoose: validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
    errorCode = 'VALIDATION_ERROR';
  }

  // MongoDB: duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
    errorCode = 'DUPLICATE_KEY';
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = err.issues?.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') || 'Validation failed';
    errorCode = 'VALIDATION_ERROR';
  }

  if (statusCode >= 500) {
    console.error('✗ Unhandled error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: errorCode,
    // Only expose stack for unexpected server errors in development.
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
}
