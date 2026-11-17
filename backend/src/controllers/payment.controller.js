import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { Order } from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

let client = null;
function getClient() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) return null;
  if (!client) client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  return client;
}

/**
 * POST /api/customer/payments/create { amount }  (customer auth)
 * Opens a Razorpay order for `amount` (rupees). The frontend uses the returned
 * orderId + keyId to launch the Razorpay checkout (UPI / cards / wallets).
 */
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const rzp = getClient();
  if (!rzp) throw ApiError.badRequest('Online payment is not configured yet');

  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount < 1) throw ApiError.badRequest('Invalid amount');

  const order = await rzp.orders.create({
    amount: amount * 100, // Razorpay works in paise
    currency: 'INR',
    receipt: 'rcpt_' + Date.now(),
  });
  res.json({ keyId: env.razorpay.keyId, orderId: order.id, amount: order.amount, currency: order.currency });
});

/**
 * POST /api/customer/payments/verify  (customer auth)
 * Verifies the Razorpay signature server-side, then marks the given orders paid.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderIds[] }
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderIds } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw ApiError.badRequest('Missing payment details');
  }
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');
  if (expected !== razorpay_signature) throw ApiError.badRequest('Payment verification failed');

  const ids = Array.isArray(orderIds) ? orderIds : [];
  if (ids.length) {
    await Order.updateMany(
      { _id: { $in: ids }, customer: req.user._id },
      { $set: { paymentMethod: 'online', paymentStatus: 'paid', razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id } }
    );
  }
  res.json({ ok: true });
});