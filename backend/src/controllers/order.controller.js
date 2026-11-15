import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { PHARMACY_STATUS } from '../config/constants.js';

function newOrderNumber() {
  return 'ORD-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

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

  const presc = typeof req.body.prescriptionImage === 'string' ? req.body.prescriptionImage : '';
  if (presc && !presc.startsWith('data:image/')) throw ApiError.badRequest('Invalid prescription image');
  if (presc && presc.length > 4000000) throw ApiError.badRequest('Prescription image is too large — please use a smaller photo');

  const listing = await PharmacyMedicineListing.findOne({ _id: listingId, active: true, deletedAt: null })
    .populate('medicine', 'name prescriptionRequired')
    .populate('pharmacy', 'name status deletedAt');
  if (!listing) throw ApiError.badRequest('This medicine listing is not available');
  if (!listing.pharmacy || listing.pharmacy.deletedAt || listing.pharmacy.status !== PHARMACY_STATUS.APPROVED) {
    throw ApiError.badRequest('This pharmacy is not currently active');
  }

  const requiresRx = Boolean(listing.prescriptionRequired || listing.medicine?.prescriptionRequired);
  if (requiresRx && !presc) throw ApiError.badRequest('A prescription photo is required for this medicine');

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
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
        total: lineTotal,
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

export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ customer: req.user._id })
    .select('-prescriptionImage')
    .populate('pharmacy', 'name')
    .sort({ createdAt: -1 });
  res.json({ items: orders });
});

export const getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id }).populate('pharmacy', 'name');
  if (!order) throw ApiError.notFound('Order not found');
  res.json({ order });
});

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