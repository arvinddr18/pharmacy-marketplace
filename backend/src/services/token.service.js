import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Access tokens carry only identity + role. They deliberately do NOT carry a
 * pharmacyId that the holder could rely on for authorization — tenant access
 * is always re-resolved server-side from the database.
 */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpires }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user._id), type: 'refresh' },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpires }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}
