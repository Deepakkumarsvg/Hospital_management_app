import jwt from 'jsonwebtoken';

// Every token carries the hospital it was issued for; authenticate() rejects
// one whose claim doesn't match the tenant the request resolved to.
//
// The claim is required here rather than left to each caller, because a
// caller that forgets it would mint a token that silently fails the check on
// every request — and the bug would look like "login is broken", not like a
// missing claim.
export function signToken(payload) {
  if (!payload?.tenant) {
    throw new Error('signToken: a tenant claim is required — pass the resolved tenant slug');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

export const verifyTokenSafe = (token) => {
  try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
};

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
