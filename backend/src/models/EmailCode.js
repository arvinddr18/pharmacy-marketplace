import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 6;

/**
 * A hashed one-time code emailed to a user for email verification or password
 * reset. Raw codes are never stored; documents auto-expire via a TTL index.
 */
const emailCodeSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['verify', 'reset'], required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Create a fresh 6-digit code for this email+purpose, replacing any old one. Returns the raw code. */
emailCodeSchema.statics.issue = async function issue(email, purpose) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 8);
  await this.deleteMany({ email: email.toLowerCase(), purpose });
  await this.create({ email: email.toLowerCase(), codeHash, purpose, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  return code;
};

/** Check a submitted code. Returns { ok } or { ok:false, reason }. Consumes the code on success. */
emailCodeSchema.statics.check = async function check(email, purpose, code) {
  const token = await this.findOne({ email: email.toLowerCase(), purpose }).sort({ createdAt: -1 });
  if (!token) return { ok: false, reason: 'no_code' };
  if (token.expiresAt < new Date()) { await token.deleteOne(); return { ok: false, reason: 'expired' }; }
  if (token.attempts >= MAX_ATTEMPTS) { await token.deleteOne(); return { ok: false, reason: 'too_many_attempts' }; }
  const match = await bcrypt.compare(String(code), token.codeHash);
  if (!match) { token.attempts += 1; await token.save(); return { ok: false, reason: 'mismatch' }; }
  await token.deleteOne();
  return { ok: true };
};

export const EmailCode = model('EmailCode', emailCodeSchema);