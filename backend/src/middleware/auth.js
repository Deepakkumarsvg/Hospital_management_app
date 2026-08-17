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

    // Security: a token is bound to the hospital that issued it.
    //
    // A missing tenant claim is treated the same as a wrong one. Allowing
    // claimless tokens through — as this used to — meant the guarantee was
    // only as strong as whichever code path minted the token, and any path
    // that forgot the claim silently opted out of the check.
    //
    // Tokens issued before this are rejected; they expire within JWT_EXPIRES_IN
    // (a day by default), and the client treats a 401 as "sign in again".
    if (req.tenant && decoded.tenant !== req.tenant.slug) {
      throw ApiError.unauthorized('Token does not belong to this hospital', 'TENANT_MISMATCH');
    }

    const user = await User.findById(decoded.sub);
    if (!user) throw ApiError.unauthorized('User no longer exists', 'USER_NOT_FOUND');
    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden('Account is not active', 'ACCOUNT_INACTIVE');
    }

    // A password change (self-service, admin reset, or forgot-password)
    // retires every token minted before it — otherwise a stolen token keeps
    // working until it expires on its own, which defeats the point of
    // changing the password.
    if (user.passwordChangedAt && decoded.iat && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      throw ApiError.unauthorized('Password was changed — please sign in again', 'TOKEN_STALE');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
