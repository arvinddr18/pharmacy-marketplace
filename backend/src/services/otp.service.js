import crypto from 'node:crypto';
import { OtpToken } from '../models/OtpToken.js';
import { env } from '../config/env.js';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

function generateCode() {
  // 6-digit numeric code.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Creates and "sends" an OTP. With no real OTP_PROVIDER configured, the code
 * is logged to the server console for development — NOT returned to the client
 * and NOT sent by SMS. Wire a provider (MSG91/Twilio) in sendViaProvider().
 */
export async function requestOtp(phone, purpose = 'login') {
  const code = generateCode();
  const codeHash = await OtpToken.hashCode(code);

  // Replace any prior unexpired OTP for this phone.
  await OtpToken.deleteMany({ phone });
  await OtpToken.create({ phone, codeHash, purpose, expiresAt: new Date(Date.now() + OTP_TTL_MS) });

  if (env.features && process.env.OTP_PROVIDER) {
    await sendViaProvider(phone, code);
    return { delivered: 'sms' };
  }

  // Dev fallback: surface the code only in the server log.
  console.log(`[otp] DEV code for ${phone}: ${code} (expires in 5 min)`);
  return { delivered: 'console', devHint: env.nodeEnv !== 'production' };
}

export async function verifyOtp(phone, code) {
  const token = await OtpToken.findOne({ phone }).sort({ createdAt: -1 });
  if (!token) return { ok: false, reason: 'no_otp' };
  if (token.expiresAt < new Date()) {
    await token.deleteOne();
    return { ok: false, reason: 'expired' };
  }
  if (token.attempts >= MAX_ATTEMPTS) {
    await token.deleteOne();
    return { ok: false, reason: 'too_many_attempts' };
  }

  const match = await token.verifyCode(code);
  if (!match) {
    token.attempts += 1;
    await token.save();
    return { ok: false, reason: 'mismatch' };
  }

  await token.deleteOne();
  return { ok: true };
}

// Placeholder — integrate a real provider here. Never claim SMS works until
// this is implemented and verified against the provider's sandbox.
async function sendViaProvider(_phone, _code) {
  throw new Error('OTP_PROVIDER set but no provider integration implemented yet');
}
