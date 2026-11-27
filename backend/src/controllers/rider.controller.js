import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { emailOrderUpdate } from '../services/email.service.js';

async function scopedOrder(req, session) {
  const q = Order.findOne({ _id: req.params.id, rider: req.user._id });
  if (session) q.session(session);
  const order = await q;
  if (!order) throw ApiError.notFound('Order not found or not assigned to you');
  return order;
}

export const myDeliveries = asyncHandler(async (req, res) => {
  const orders = await Order.find({ rider: req.user._id })
    .populate('pharmacy', 'name address phone')
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(100);
  const safe = orders.map((o) => {
    const obj = o.toObject();
    delete obj.deliveryOtp;
    return obj;
  });
  res.json({ items: safe });
});

export const confirmPickup = asyncHandler(async (req, res) => {
  const order = await scopedOrder(req);
  if (order.status !== ORDER_STATUS.ASSIGNED) throw ApiError.badRequest('This order is not ready for pickup');
  order.status = ORDER_STATUS.OUT_FOR_DELIVERY;
  order.deliveryOtp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  order.timeline.push({ status: ORDER_STATUS.OUT_FOR_DELIVERY, at: new Date(), note: 'Picked up, out for delivery' });
  await order.save();
  emailOrderUpdate(order);
  const obj = order.toObject();
  delete obj.deliveryOtp;
  res.json({ order: obj });
});

export const confirmDelivery = asyncHandler(async (req, res) => {
  const otp = String(req.body?.otp || '').trim();
  const collectedVia = ['cash', 'upi'].includes(req.body?.collectedVia) ? req.body.collectedVia : undefined;
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await scopedOrder(req, session);
      if (order.status !== ORDER_STATUS.OUT_FOR_DELIVERY) throw ApiError.badRequest('This order is not out for delivery');
      if (!order.deliveryOtp || otp !== order.deliveryOtp) throw ApiError.badRequest('Incorrect delivery OTP');

      for (const r of order.reservations) {
        await InventoryBatch.updateOne({ _id: r.batch }, { $inc: { quantity: -r.quantity, reserved: -r.quantity } }, { session });
      }
      order.status = ORDER_STATUS.DELIVERED;
      if (collectedVia) { order.collectedVia = collectedVia; order.paymentStatus = 'paid'; }
      order.deliveryOtp = undefined;
      order.timeline.push({ status: ORDER_STATUS.DELIVERED, at: new Date(), note: 'Delivered (OTP verified)' });
      await order.save({ session });
    });
    emailOrderUpdate(order);
    const obj = order.toObject();
    delete obj.deliveryOtp;
    res.json({ order: obj });
  } finally {
    await session.endSession();
  }
});