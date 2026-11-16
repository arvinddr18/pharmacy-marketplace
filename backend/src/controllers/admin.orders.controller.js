import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { PHARMACY_STATUS } from '../config/constants.js';

export const listAllOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const orders = await Order.find(filter)
    .select('-prescriptionImage')
    .populate('customer', 'name phone')
    .populate('pharmacy', 'name')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ items: orders });
});

/** GET /api/admin/orders/:id/prescription — the uploaded Rx image, for admin review. */
export const getOrderPrescriptionAdmin = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).select('orderNumber prescriptionImage');
  if (!order) throw ApiError.notFound('Order not found');
  res.json({ orderNumber: order.orderNumber, prescriptionImage: order.prescriptionImage || '' });
});

/** POST /api/admin/orders/:id/assign-pharmacy { pharmacyId } — route a prescription order to a shop. */
export const assignPharmacyToOrder = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ _id: req.body.pharmacyId, status: PHARMACY_STATUS.APPROVED, deletedAt: null });
  if (!pharmacy) throw ApiError.badRequest('Select an approved pharmacy');

  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.kind !== 'prescription') throw ApiError.badRequest('Only prescription orders are routed this way');
  if (order.status !== ORDER_STATUS.PLACED) throw ApiError.badRequest('This order can no longer be reassigned');

  order.pharmacy = pharmacy._id;
  order.timeline.push({ status: ORDER_STATUS.PLACED, at: new Date(), note: `Sent to ${pharmacy.name}` });
  await order.save();
  res.json({ order, message: `Sent to ${pharmacy.name}` });
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