import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

// Verifies the Bearer JWT and attaches the live user to req.user.
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Authentication token missing', 'NO_TOKEN');

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token', 'INVALID_TOKEN');
    }

    // Security: a token minted for one hospital cannot be used on another.
    // (Older tokens without a tenant claim are allowed on the resolved tenant.)
    if (decoded.tenant && req.tenant && decoded.tenant !== req.tenant.slug) {
      throw ApiError.unauthorized('Token does not belong to this hospital', 'TENANT_MISMATCH');
    }

    const user = await User.findById(decoded.sub);
    if (!user) throw ApiError.unauthorized('User no longer exists', 'USER_NOT_FOUND');
    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden('Account is not active', 'ACCOUNT_INACTIVE');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
