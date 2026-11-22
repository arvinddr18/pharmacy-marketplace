import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { User } from '../models/User.js';
import { Review } from '../models/Review.js';
import { Coupon } from '../models/Coupon.js';
import { Session } from '../models/Session.js';
import { EmailCode } from '../models/EmailCode.js';
import { emailOrderUpdate, sendVerificationEmail } from '../services/email.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { PHARMACY_STATUS, ACCOUNT_STATUS } from '../config/constants.js';

/* ---------------- Account self-service (profile / deactivate / delete) ---------------- */

/** PATCH /api/customer/profile { name, phone } — update own name / mobile. */
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  if (typeof req.body.name === 'string') {
    const n = req.body.name.trim();
    if (n.length < 2) throw ApiError.badRequest('Please enter your name');
    user.name = n;
  }
  if (typeof req.body.phone === 'string') {
    const p = req.body.phone.trim();
    if (p && !/^\d{10}$/.test(p)) throw ApiError.badRequest('Enter a valid 10-digit mobile');
    user.phone = p || undefined;
  }
  await user.save();
  res.json({ user: user.toSafeJSON() });
});

/** GET /api/customer/sessions — the devices/browsers this account is logged in on. */
export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ user: req.user._id, revokedAt: null }).sort({ lastSeenAt: -1 }).lean();
  const items = sessions.map((s) => ({
    id: String(s._id),
    device: s.device,
    lastSeenAt: s.lastSeenAt,
    createdAt: s.createdAt,
    current: req.sid ? String(s._id) === String(req.sid) : false,
  }));
  res.json({ items });
});

/** DELETE /api/customer/sessions/others — log out every device except this one. */
export const revokeOtherSessions = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id, revokedAt: null };
  if (req.sid) filter._id = { $ne: req.sid };
  await Session.updateMany(filter, { $set: { revokedAt: new Date() } });
  res.json({ ok: true });
});

/** DELETE /api/customer/sessions/:id — log out one device. */
export const revokeSession = asyncHandler(async (req, res) => {
  await Session.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { revokedAt: new Date() } });
  res.json({ ok: true });
});

/** PATCH /api/customer/password { currentPassword, newPassword } — change own password. */
export const changePassword = asyncHandler(async (req, res) => {
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) throw ApiError.badRequest('New password must be at least 8 characters');
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  if (user.passwordHash) {
    const ok = await user.verifyPassword(String(req.body.currentPassword || ''));
    if (!ok) throw ApiError.unauthorized('Current password is incorrect');
  }
  await user.setPassword(newPassword);
  await user.save();
  res.json({ ok: true, message: 'Password changed' });
});

/** POST /api/customer/account/deactivate — temporary; signing in again reactivates. */
export const deactivateAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  user.status = ACCOUNT_STATUS.DISABLED;
  await user.save();
  res.json({ ok: true, message: 'Your account is deactivated. Sign in anytime to reactivate it.' });
});

/** DELETE /api/customer/account { password } — permanent; scrubs personal data. */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  if (user.passwordHash) {
    const ok = await user.verifyPassword(req.body.password || '');
    if (!ok) throw ApiError.unauthorized('Password is incorrect');
  }
  // Soft-delete + anonymise: orders stay for the pharmacy's records, but personal
  // data is removed and the email/phone are freed so they can register again later.
  user.deletedAt = new Date();
  user.status = ACCOUNT_STATUS.DISABLED;
  user.name = 'Deleted user';
  user.email = undefined;
  user.phone = undefined;
  user.passwordHash = undefined;
  user.addresses = [];
  user.savedSearches = [];
  user.emailVerified = false;
  await user.save();
  res.json({ ok: true, message: 'Your account has been permanently deleted.' });
});

/* ---------------- Two-step verification (2FA) ---------------- */

/** POST /api/customer/2fa/send-code — email a code to confirm turning 2FA on. */
export const send2faSetupCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  if (!user.email) throw ApiError.badRequest('Add an email to your account before turning on two-step verification.');
  const code = await EmailCode.issue(user.email, '2fa-setup');
  await sendVerificationEmail(user.email, user.name, code);
  res.json({ ok: true, message: 'We emailed you a 6-digit code to confirm.' });
});

/** POST /api/customer/2fa/enable { code } — verify the code and turn 2FA on. */
export const enable2fa = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!code) throw ApiError.badRequest('Enter the code we emailed you');
  const user = await User.findById(req.user._id);
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  if (!user.email) throw ApiError.badRequest('Add an email to your account first.');
  const result = await EmailCode.check(user.email, '2fa-setup', code);
  if (!result.ok) {
    const map = { no_code: 'No code found — please resend', expired: 'Code expired — please resend', too_many_attempts: 'Too many attempts — please resend', mismatch: 'Incorrect code' };
    throw ApiError.badRequest(map[result.reason] ?? 'Verification failed');
  }
  user.twoFactorEnabled = true;
  await user.save();
  res.json({ ok: true, twoFactorEnabled: true, message: 'Two-step verification is on. We will email a code each time you sign in.' });
});

/** POST /api/customer/2fa/disable — turn 2FA off (already signed in). */
export const disable2fa = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.deletedAt) throw ApiError.notFound('Account not found');
  user.twoFactorEnabled = false;
  await user.save();
  res.json({ ok: true, twoFactorEnabled: false, message: 'Two-step verification is off.' });
});

function newOrderNumber() {
  return 'ORD-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * POST /api/customer/orders  (customer auth)
 * Places a single-pharmacy order and reserves stock atomically.
 * Body: { listingId, quantity, deliveryAddress:{line1,city,pincode,phone,instructions?} }
 *
 * While FEATURE_LIVE_ORDERS is off, orders are marked isDemo (no real payment
 * or dispensing). The flow still works end to end for testing.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { listingId, quantity } = req.body;
  const qty = parseInt(quantity, 10);
  if (!listingId || !Number.isInteger(qty) || qty < 1) {
    throw ApiError.badRequest('listingId and a quantity of at least 1 are required');
  }
  const addr = req.body.deliveryAddress || {};
  if (!addr.line1 || !/^\d{6}$/.test(addr.pincode || '')) {
    throw ApiError.badRequest('A delivery address with a valid 6-digit PIN code is required');
  }

  // Optional prescription photo (base64 data URL). Kept small by client-side compression.
  const presc = typeof req.body.prescriptionImage === 'string' ? req.body.prescriptionImage : '';
  if (presc && !presc.startsWith('data:image/')) throw ApiError.badRequest('Invalid prescription image');
  if (presc && presc.length > 4_000_000) throw ApiError.badRequest('Prescription image is too large — please use a smaller photo');

  const listing = await PharmacyMedicineListing.findOne({ _id: listingId, active: true, deletedAt: null })
    .populate('medicine', 'name prescriptionRequired')
    .populate('pharmacy', 'name status deletedAt');
  if (!listing) throw ApiError.badRequest('This medicine listing is not available');
  if (!listing.pharmacy || listing.pharmacy.deletedAt || listing.pharmacy.status !== PHARMACY_STATUS.APPROVED) {
    throw ApiError.badRequest('This pharmacy is not currently active');
  }

  // Server-side rule: a prescription-required medicine can never be ordered
  // without a prescription photo (enforced here, not just in the app).
  const requiresRx = Boolean(listing.prescriptionRequired || listing.medicine?.prescriptionRequired);
  if (requiresRx && !presc) throw ApiError.badRequest('A prescription photo is required for this medicine');

  // Optional coupon. Validated server-side; the % is applied to THIS order's
  // subtotal (so a cart split across shops still gets the same % off each).
  const couponCode = String(req.body.couponCode || '').toUpperCase().trim();
  const cartSubtotal = Math.max(0, parseInt(req.body.cartSubtotal, 10) || 0);
  let coupon = null;
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode });
    if (!coupon || !coupon.isUsable()) throw ApiError.badRequest('This coupon is not valid');
    if (coupon.minOrder && cartSubtotal < coupon.minOrder) {
      throw ApiError.badRequest(`Add items worth ₹${coupon.minOrder} to use ${couponCode}`);
    }
  }

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      // Reserve `qty` units across non-expired batches, earliest expiry first.
      const now = new Date();
      const batches = await InventoryBatch.find({ listing: listing._id, deletedAt: null, expiryDate: { $gt: now } })
        .sort({ expiryDate: 1 })
        .session(session);

      let need = qty;
      const reservations = [];
      for (const b of batches) {
        if (need <= 0) break;
        const avail = b.quantity - b.reserved;
        if (avail <= 0) continue;
        const take = Math.min(avail, need);
        b.reserved += take;
        await b.save({ session });
        reservations.push({ batch: b._id, quantity: take });
        need -= take;
      }
      if (need > 0) throw ApiError.badRequest('Not enough stock available at this pharmacy');

      const unitPrice = listing.sellingPrice;
      const lineTotal = unitPrice * qty;
      let discount = 0;
      if (coupon) {
        discount = Math.round((lineTotal * coupon.percent) / 100);
        if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
        discount = Math.min(discount, lineTotal);
      }
      const prescriptionRequired = Boolean(listing.prescriptionRequired || listing.medicine?.prescriptionRequired);

      const [created] = await Order.create([{
        orderNumber: newOrderNumber(),
        customer: req.user._id,
        pharmacy: listing.pharmacy._id,
        items: [{
          listing: listing._id,
          medicine: listing.medicine._id,
          name: listing.medicine.name,
          quantity: qty,
          unitPrice,
          lineTotal,
          prescriptionRequired,
        }],
        reservations,
        itemsTotal: lineTotal,
        deliveryFee: 0,
        couponCode: coupon ? coupon.code : undefined,
        discount,
        total: lineTotal - discount,
        paymentMethod: req.body.paymentMethod === 'online' ? 'online' : 'cod',
        deliveryAddress: {
          line1: addr.line1, city: addr.city || '', pincode: addr.pincode,
          phone: addr.phone || req.user.phone || '', instructions: addr.instructions || '',
        },
        prescriptionRequired,
        prescriptionImage: presc || undefined,
        hasPrescription: Boolean(presc),
        status: ORDER_STATUS.PLACED,
        isDemo: !env.features.liveOrders,
        timeline: [{ status: ORDER_STATUS.PLACED, at: new Date(), note: 'Order placed' }],
      }], { session });

      order = created;
    });

    emailOrderUpdate(order);
    res.status(201).json({ order });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('Could not generate order, please retry');
    throw err;
  } finally {
    await session.endSession();
  }
});

/**
 * POST /api/customer/prescription-orders  (customer auth)
 * Customer uploads a prescription photo + delivery address (no shop chosen).
 * Created unassigned; the admin routes it to a pharmacy which sets the price.
 */
export const createPrescriptionOrder = asyncHandler(async (req, res) => {
  const addr = req.body.deliveryAddress || {};
  if (!addr.line1 || !/^\d{6}$/.test(addr.pincode || '')) {
    throw ApiError.badRequest('A delivery address with a valid 6-digit PIN code is required');
  }
  const presc = typeof req.body.prescriptionImage === 'string' ? req.body.prescriptionImage : '';
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  // The customer can either upload a prescription photo OR simply type the
  // medicine name(s) they need — at least one is required.
  if (presc) {
    if (!presc.startsWith('data:image/')) throw ApiError.badRequest('Invalid prescription image');
    if (presc.length > 4_000_000) throw ApiError.badRequest('Prescription image is too large — please use a smaller photo');
  }
  if (!presc && !note) throw ApiError.badRequest('Type the medicine name you need, or upload a prescription photo');

  try {
    const order = await Order.create({
      orderNumber: newOrderNumber(),
      customer: req.user._id,
      kind: 'prescription',
      items: [],
      reservations: [],
      itemsTotal: 0,
      deliveryFee: 0,
      total: 0,
      deliveryAddress: {
        line1: addr.line1, city: addr.city || '', pincode: addr.pincode,
        phone: addr.phone || req.user.phone || '', instructions: addr.instructions || '',
      },
      prescriptionRequired: !!presc,
      prescriptionImage: presc || undefined,
      hasPrescription: !!presc,
      prescriptionNote: note,
      status: ORDER_STATUS.PLACED,
      isDemo: !env.features.liveOrders,
      timeline: [{ status: ORDER_STATUS.PLACED, at: new Date(), note: presc ? 'Prescription uploaded' : 'Medicine request submitted' }],
    });
    emailOrderUpdate(order);
    res.status(201).json({ order: { _id: order._id, orderNumber: order.orderNumber } });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('Could not place order, please retry');
    throw err;
  }
});

/** GET /api/customer/orders — this customer's orders, newest first. */
export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ customer: req.user._id })
    .select('-prescriptionImage')
    .populate('pharmacy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  // Attach this customer's own rating for each order (so the app shows
  // "Rate this order" or the stars they already gave).
  const reviews = await Review.find({ customer: req.user._id }).select('order rating').lean();
  const byOrder = {};
  for (const rv of reviews) byOrder[String(rv.order)] = rv.rating;
  for (const o of orders) o.myRating = byOrder[String(o._id)] || 0;
  res.json({ items: orders });
});

/**
 * POST /api/customer/orders/:id/review  (customer auth)
 * Rate a delivered order 1–5 with an optional comment. One review per order.
 */
export const addReview = asyncHandler(async (req, res) => {
  const rating = parseInt(req.body.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ApiError.badRequest('Please give a rating between 1 and 5 stars');
  }
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';

  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== ORDER_STATUS.DELIVERED) {
    throw ApiError.badRequest('You can only rate an order after it is delivered');
  }
  const existing = await Review.findOne({ order: order._id });
  if (existing) throw ApiError.badRequest('You have already rated this order');

  const review = await Review.create({
    customer: req.user._id,
    pharmacy: order.pharmacy,
    order: order._id,
    customerName: req.user.name || '',
    rating,
    comment,
  });
  res.status(201).json({ review });
});

/** GET /api/customer/orders/:id — one of this customer's orders. */
export const getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id }).populate('pharmacy', 'name');
  if (!order) throw ApiError.notFound('Order not found');
  res.json({ order });
});

/** GET /api/customer/addresses — this customer's saved delivery addresses. */
export const listAddresses = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('addresses');
  res.json({ items: user?.addresses || [] });
});

/** POST /api/customer/addresses — save a new delivery address. */
export const addAddress = asyncHandler(async (req, res) => {
  const { label, line1, city, pincode, phone, instructions } = req.body;
  if (!line1 || !/^\d{6}$/.test(pincode || '')) {
    throw ApiError.badRequest('An address with a valid 6-digit PIN code is required');
  }
  const user = await User.findById(req.user._id);
  user.addresses.push({
    label: (label || 'Home').slice(0, 40), line1, city: city || '', pincode,
    phone: phone || '', instructions: instructions || '',
  });
  await user.save();
  res.status(201).json({ items: user.addresses });
});

/** DELETE /api/customer/addresses/:id — remove a saved address. */
export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.addresses = user.addresses.filter((a) => String(a._id) !== String(req.params.id));
  await user.save();
  res.json({ items: user.addresses });
});

/** GET /api/customer/saved-searches — this customer's saved (⭐) search terms. */
export const listSavedSearches = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('savedSearches');
  res.json({ items: user?.savedSearches || [] });
});

/** POST /api/customer/saved-searches { q } — save a search term. */
export const addSavedSearch = asyncHandler(async (req, res) => {
  const q = String(req.body.q || '').trim().slice(0, 60);
  if (!q) throw ApiError.badRequest('Nothing to save');
  const user = await User.findById(req.user._id);
  user.savedSearches = user.savedSearches || [];
  if (!user.savedSearches.some((s) => s.toLowerCase() === q.toLowerCase())) {
    user.savedSearches.unshift(q);
    user.savedSearches = user.savedSearches.slice(0, 20);
    await user.save();
  }
  res.status(201).json({ items: user.savedSearches });
});

/** DELETE /api/customer/saved-searches/:q — remove a saved search term. */
export const deleteSavedSearch = asyncHandler(async (req, res) => {
  const q = decodeURIComponent(req.params.q || '').toLowerCase();
  const user = await User.findById(req.user._id);
  user.savedSearches = (user.savedSearches || []).filter((s) => s.toLowerCase() !== q);
  await user.save();
  res.json({ items: user.savedSearches });
});

/** POST /api/customer/coupons/validate — preview a coupon against a cart subtotal. */
export const validateCoupon = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().trim();
  const cartSubtotal = Math.max(0, parseInt(req.body.cartSubtotal, 10) || 0);
  if (!code) throw ApiError.badRequest('Enter a coupon code');
  const coupon = await Coupon.findOne({ code });
  if (!coupon || !coupon.isUsable()) throw ApiError.badRequest('This coupon is not valid or has expired');
  if (coupon.minOrder && cartSubtotal < coupon.minOrder) {
    throw ApiError.badRequest(`This coupon needs a minimum order of ₹${coupon.minOrder}`);
  }
  let discount = Math.round((cartSubtotal * coupon.percent) / 100);
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, cartSubtotal);
  res.json({
    code: coupon.code, percent: coupon.percent, description: coupon.description || '',
    discount, total: cartSubtotal - discount,
  });
});

/** POST /api/customer/orders/:id/cancel — customer cancels before pharmacy accepts; releases stock. */
export const cancelMyOrder = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: req.params.id, customer: req.user._id }).session(session);
      if (!order) throw ApiError.notFound('Order not found');
      if (order.status !== ORDER_STATUS.PLACED) {
        throw ApiError.badRequest('Only an order that is still "placed" can be cancelled');
      }
      // release reserved stock
      for (const r of order.reservations) {
        await InventoryBatch.updateOne({ _id: r.batch }, { $inc: { reserved: -r.quantity } }, { session });
      }
      order.status = ORDER_STATUS.CANCELLED;
      order.timeline.push({ status: ORDER_STATUS.CANCELLED, at: new Date(), note: 'Cancelled by customer' });
      await order.save({ session });
    });
    res.json({ order });
  } finally {
    await session.endSession();
  }
});