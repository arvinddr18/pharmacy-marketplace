import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listAllOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const orders = await Order.find(filter)
    .populate('customer', 'name phone')
    .populate('pharmacy', 'name')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ items: orders });
});

export const markDelivered = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findById(req.params.id).session(session);
      if (!order) throw ApiError.notFound('Order not found');
      if (![ORDER_STATUS.READY, ORDER_STATUS.ACCEPTED].includes(order.status)) {
        throw ApiError.badRequest('Order must be accepted or ready before it can be delivered');
      }
      for (const r of order.reservations) {
        await InventoryBatch.updateOne({ _id: r.batch }, { $inc: { quantity: -r.quantity, reserved: -r.quantity } }, { session });
      }
      order.status = ORDER_STATUS.DELIVERED;
      order.timeline.push({ status: ORDER_STATUS.DELIVERED, at: new Date(), note: 'Delivered (company)' });
      await order.save({ session });
    });
    res.json({ order });
  } finally {
    await session.endSession();
  }
});