import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { User } from '../models/User.js';
import { Review } from '../models/Review.js';
import { Coupon } from '../models/Coupon.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { PHARMACY_STATUS } from '../config/constants.js';

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

    res.status(201).json({ order });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('Could not generate order, please retry');
    throw err;
  } finally {
    await session.endSession();
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