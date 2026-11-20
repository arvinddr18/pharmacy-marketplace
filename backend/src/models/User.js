import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLE_VALUES, ROLES, ACCOUNT_STATUS } from '../config/constants.js';

const { Schema, model } = mongoose;

/**
 * User is the single identity collection for every human on the platform:
 * customers, pharmacy owners/staff, riders and platform admins.
 * Tenant membership (which pharmacy a user belongs to) is kept in a
 * separate PharmacyMembership collection, NOT as a frontend-supplied field.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // Phone is the primary identifier for customers/riders (OTP login).
    phone: {
      type: String,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },

    // Email is used by pharmacy/admin dashboard logins.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
    },

    // Password is only set for dashboard roles. Customers/riders use OTP.
    passwordHash: { type: String, select: false },

    role: { type: String, enum: ROLE_VALUES, required: true, default: ROLES.CUSTOMER },

    status: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.ACTIVE },

    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },

    lastLoginAt: { type: Date },

    // Saved delivery addresses for customers (pick one at checkout).
    addresses: [{
      label: { type: String, trim: true, maxlength: 40 },
      line1: { type: String, trim: true, maxlength: 200 },
      city: { type: String, trim: true, maxlength: 80 },
      pincode: { type: String, trim: true },
      phone: { type: String, trim: true },
      instructions: { type: String, trim: true, maxlength: 200 },
    }],

    // Saved (⭐) search terms for quick re-search without typing.
    savedSearches: [{ type: String, trim: true, maxlength: 60 }],

    // Soft-delete marker.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A phone or email must be unique when present (partial indexes ignore nulls).
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = async function verifyPassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

export const User = model('User', userSchema);