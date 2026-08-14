import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../config/roles.js';

// Restrict a route to one or more roles. SUPER_ADMIN always passes.
// Usage: router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.HR), handler)
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Not authenticated', 'NOT_AUTHENTICATED'));

    if (req.user.role === ROLES.SUPER_ADMIN) return next();

    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action', 'FORBIDDEN'));
    }
    next();
  };
}
