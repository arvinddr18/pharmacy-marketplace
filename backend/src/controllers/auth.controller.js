import { User } from '../models/User.js';
import { requestOtp, verifyOtp } from '../services/otp.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/token.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ACCOUNT_STATUS, ROLES } from '../config/constants.js';
import { env } from '../config/env.js';

/** POST /api/auth/demo-login — easy test login for a demo customer (no SMS). */
export const demoLoginHandler = asyncHandler(async (req, res) => {
  if (env.features.liveOrders) throw ApiError.forbidden('Demo login is disabled');
  const phone = '9000000001';
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, name: 'Demo Customer', role: ROLES.CUSTOMER, phoneVerified: true });
  }
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ user: user.toSafeJSON(), accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) });
});

/** POST /api/auth/otp/request — customer/rider OTP login step 1. */
export const requestOtpHandler = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const result = await requestOtp(phone, 'login');
  res.json({ message: 'OTP sent', ...result });
});

/** POST /api/auth/otp/verify — customer OTP login step 2; creates account on first login. */
export const verifyOtpHandler = asyncHandler(async (req, res) => {
  const { phone, code, name } = req.body;

  const result = await verifyOtp(phone, code);
  if (!result.ok) {
    const map = {
      no_otp: 'No OTP requested for this number',
      expired: 'OTP expired, request a new one',
      too_many_attempts: 'Too many attempts, request a new OTP',
      mismatch: 'Incorrect OTP',
    };
    throw ApiError.badRequest(map[result.reason] ?? 'OTP verification failed');
  }

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      phone,
      name: name?.trim() || 'Customer',
      role: ROLES.CUSTOMER,
      phoneVerified: true,
    });
  } else {
    user.phoneVerified = true;
    user.lastLoginAt = new Date();
    await user.save();
  }

  res.json({
    user: user.toSafeJSON(),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
});

/** POST /api/auth/login — email+password login for pharmacy/admin dashboards. */
export const dashboardLoginHandler = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.deletedAt) throw ApiError.unauthorized('Invalid email or password');
  if (user.status === ACCOUNT_STATUS.DISABLED) throw ApiError.forbidden('Account disabled');

  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    user: user.toSafeJSON(),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
});

/** POST /api/auth/refresh — exchange a refresh token for a new access token. */
export const refreshHandler = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.deletedAt) throw ApiError.unauthorized('Account not found');

  res.json({ accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) });
});

/** GET /api/auth/me — current authenticated user. */
export const meHandler = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});
