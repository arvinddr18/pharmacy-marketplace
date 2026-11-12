import { verifyAccessToken } from '../services/token.service.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ACCOUNT_STATUS } from '../config/constants.js';

/**
 * Authenticates the request. Attaches req.user (the live DB document, so a
 * disabled/deleted account is rejected even with a valid token).
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.deletedAt) throw ApiError.unauthorized('Account not found');
  if (user.status === ACCOUNT_STATUS.DISABLED) throw ApiError.forbidden('Account disabled');

  req.user = user;
  next();
});

/** Restricts a route to the given roles. Use after authenticate. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have access to this resource'));
  }
  next();
};
