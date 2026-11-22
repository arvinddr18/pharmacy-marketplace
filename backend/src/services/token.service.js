import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Access tokens carry only identity + role. They deliberately do NOT carry a
 * pharmacyId that the holder could rely on for authorization — tenant access
 * is always re-resolved server-side from the database.
 */
export function signAccessToken(user, sid) {
  const payload = { sub: String(user._id), role: user.role };
  if (sid) payload.sid = sid;
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpires });
}

export function signRefreshToken(user, sid) {
  const payload = { sub: String(user._id), type: 'refresh' };
  if (sid) payload.sid = sid;
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpires });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}
