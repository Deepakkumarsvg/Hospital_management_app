import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';

// Validate credentials and issue a JWT. Business logic lives here, not in the controller.
export async function loginUser({ email, password }, tenant = null) {
  // passwordHash has select:false, so explicitly request it.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Account is not active', 'ACCOUNT_INACTIVE');
  }

  user.lastLoginAt = new Date();
  await user.save();

  // Bake the tenant into the token so it can be cross-checked on every request.
  const token = signToken({ sub: user._id.toString(), role: user.role, tenant: tenant?.slug || null });
  return { token, user: user.toSafeJSON() };
}
