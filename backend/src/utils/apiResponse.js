// Standard success envelope used across all endpoints.
export function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.pagination = meta;
  return res.status(statusCode).json(body);
}

// Wraps async route handlers so thrown errors reach the central handler.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
