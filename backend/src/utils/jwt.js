import jwt from 'jsonwebtoken';

// Every token carries the hospital it was issued for; authenticate() rejects
// one whose claim doesn't match the tenant the request resolved to.
//
// The claim is required here rather than left to each caller, because a
// caller that forgets it would mint a token that silently fails the check on
// every request — and the bug would look like "login is broken", not like a
// missing claim.
// Access tokens are deliberately short-lived. They cannot be revoked — that is
// the nature of a stateless JWT — so the window in which a stolen one is useful
// is kept small, and the long-lived half of the pair is a revocable refresh
// token instead (see models/Session.js).
export const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '15m';

export function signToken(payload, { expiresIn = ACCESS_TOKEN_TTL } = {}) {
  if (!payload?.tenant) {
    throw new Error('signToken: a tenant claim is required — pass the resolved tenant slug');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

export const verifyTokenSafe = (token) => {
  try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
};

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
