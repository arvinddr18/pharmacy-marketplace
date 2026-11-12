import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

/**
 * Stores a hashed OTP for phone verification/login. The raw code is never
 * persisted. Documents auto-expire via a TTL index.
 */
const otpSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['login', 'register'], default: 'login' },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL: Mongo removes the doc once expiresAt passes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

otpSchema.statics.hashCode = (code) => bcrypt.hash(code, 8);
otpSchema.methods.verifyCode = function verifyCode(code) {
  return bcrypt.compare(code, this.codeHash);
};

export const OtpToken = model('OtpToken', otpSchema);
