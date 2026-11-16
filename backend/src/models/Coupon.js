import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A percentage discount coupon the customer can apply at checkout.
 * Percentage-based so it stays correct even when a cart is split into
 * several per-pharmacy orders (each order gets the same % off).
 */
const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    description: { type: String, trim: true, maxlength: 160 },
    percent: { type: Number, required: true, min: 1, max: 90 },
    minOrder: { type: Number, default: 0, min: 0 },     // minimum cart subtotal to use
    maxDiscount: { type: Number, default: 0, min: 0 },  // 0 = no cap; cap is per order
    active: { type: Boolean, default: true },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

/** Is this coupon usable right now? */
couponSchema.methods.isUsable = function isUsable() {
  if (!this.active) return false;
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) return false;
  return true;
};

export const Coupon = model('Coupon', couponSchema);