import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

async function scopedOrder(req, session) {
  const q = Order.findOne({ _id: req.params.id, pharmacy: req.pharmacyId });
  if (session) q.session(session);
  const order = await q;
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

export const acceptOrder = asyncHandler(async (req, res) => {
  const order = await scopedOrder(req);
  if (order.status !== ORDER_STATUS.PLACED) throw ApiError.badRequest('Only a placed order can be accepted');
  order.status = ORDER_STATUS.ACCEPTED;
  order.timeline.push({ status: ORDER_STATUS.ACCEPTED, at: new Date(), note: 'Accepted by pharmacy' });
  await order.save();
  res.json({ order });
});

export const markReady = asyncHandler(async (req, res) => {
  const order = await scopedOrder(req);
  if (order.status !== ORDER_STATUS.ACCEPTED) throw ApiError.badRequest('Only an accepted order can be marked ready');
  order.status = ORDER_STATUS.READY;
  order.timeline.push({ status: ORDER_STATUS.READY, at: new Date(), note: 'Dispensed & packed, ready for pickup' });
  await order.save();
  res.json({ order });
});

export const rejectOrder = asyncHandler(async (req, res) => {
  const reason = (req.body?.reason || '').trim();
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await scopedOrder(req, session);
      if (![ORDER_STATUS.PLACED, ORDER_STATUS.ACCEPTED].includes(order.status)) {
        throw ApiError.badRequest('This order can no longer be rejected');
      }
      for (const r of order.reservations) {
        await InventoryBatch.updateOne({ _id: r.batch }, { $inc: { reserved: -r.quantity } }, { session });
      }
      order.status = ORDER_STATUS.REJECTED;
      order.rejectionReason = reason || 'Rejected by pharmacy';
      order.timeline.push({ status: ORDER_STATUS.REJECTED, at: new Date(), note: order.rejectionReason });
      await order.save({ session });
    });
    res.json({ order });
  } finally {
    await session.endSession();
  }
});