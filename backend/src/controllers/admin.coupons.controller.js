import { Coupon } from '../models/Coupon.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

/** GET /api/admin/coupons — all coupons, newest first. */
export const listCoupons = asyncHandler(async (req, res) => {
  const items = await Coupon.find().sort({ createdAt: -1 });
  res.json({ items });
});

/** POST /api/admin/coupons — create a coupon. */
export const createCoupon = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().trim();
  const percent = parseInt(req.body.percent, 10);
  if (!/^[A-Z0-9]{3,24}$/.test(code)) throw ApiError.badRequest('Code must be 3–24 letters/numbers (no spaces)');
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) throw ApiError.badRequest('Percent off must be between 1 and 90');

  const exists = await Coupon.findOne({ code });
  if (exists) throw ApiError.badRequest('A coupon with that code already exists');

  const coupon = await Coupon.create({
    code,
    percent,
    description: String(req.body.description || '').slice(0, 160),
    minOrder: Math.max(0, parseInt(req.body.minOrder, 10) || 0),
    maxDiscount: Math.max(0, parseInt(req.body.maxDiscount, 10) || 0),
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
    active: true,
  });
  res.status(201).json({ coupon });
});

/** POST /api/admin/coupons/:id/toggle — turn a coupon on/off. */
export const toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  coupon.active = !coupon.active;
  await coupon.save();
  res.json({ coupon });
});

/** DELETE /api/admin/coupons/:id — remove a coupon. */
export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  res.json({ ok: true });
});