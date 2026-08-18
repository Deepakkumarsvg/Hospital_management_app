import { ApiError } from '../utils/ApiError.js';
import { captureError } from '../services/errorTracking.js';

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

  // The database is unreachable — the server is fine, its dependency is not.
  // That's a 503, not a 500: it tells the caller (and any load balancer) that
  // this is temporary and worth retrying, and it gives the operator something
  // actionable instead of "Internal server error" on every single request.
  //
  // Mongoose surfaces this three ways: server selection failing outright, the
  // socket dying mid-request, or a query sitting in the buffer until it times
  // out because there is no connection to send it on.
  if (
    err.name === 'MongooseServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoNotConnectedError' ||
    (err.name === 'MongooseError' && /buffering timed out/i.test(err.message))
  ) {
    statusCode = 503;
    errorCode = 'DATABASE_UNAVAILABLE';
    message = 'Cannot reach the database right now. Please try again in a moment.';
  }

  if (statusCode >= 500) {
    console.error('✗ Unhandled error:', err);

    // Also record it where it can be searched and counted. Only 5xx: a 404 or
    // a rejected password is the system working, and filling the error list
    // with those is how the error list stops being read.
    //
    // Fire-and-forget — the response has to go out either way.
    captureError({ error: err, req, source: 'backend', statusCode });
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: errorCode,
    ...(err.details !== undefined ? { details: err.details } : {}),
    // Only expose stack for unexpected server errors in development.
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
}
