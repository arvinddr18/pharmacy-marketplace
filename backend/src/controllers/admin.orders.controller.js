import mongoose from 'mongoose';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { PHARMACY_STATUS } from '../config/constants.js';
import { emailOrderUpdate } from '../services/email.service.js';

/**
 * GET /api/admin/pharmacies-with-medicine?q=dolo
 * For routing a prescription/typed request: which approved pharmacies actually
 * stock a medicine matching the search text, with price + available units.
 * In-stock shops first, cheapest first.
 */
export const findPharmaciesWithMedicine = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ items: [] });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const meds = await MedicineCatalogue.find({ name: rx, deletedAt: null })
    .select('_id name strength').limit(25);
  if (!meds.length) return res.json({ items: [] });
  const medById = {};
  meds.forEach((m) => { medById[String(m._id)] = m; });

  const listings = await PharmacyMedicineListing.find({
    medicine: { $in: meds.map((m) => m._id) }, active: true, deletedAt: null,
  }).populate('pharmacy', 'name address status deletedAt');

  const now = new Date();
  const items = [];
  for (const l of listings) {
    const ph = l.pharmacy;
    if (!ph || ph.deletedAt || ph.status !== PHARMACY_STATUS.APPROVED) continue;
    const batches = await InventoryBatch.find({ listing: l._id, deletedAt: null });
    const available = batches.reduce(
      (s, b) => s + (b.expiryDate > now ? Math.max(0, b.quantity - b.reserved) : 0), 0
    );
    const med = medById[String(l.medicine)];
    items.push({
      pharmacyId: ph._id,
      pharmacyName: ph.name,
      city: ph.address?.city || '',
      medicineName: med ? [med.name, med.strength].filter(Boolean).join(' ') : '',
      sellingPrice: l.sellingPrice,
      mrp: l.mrp,
      available,
      inStock: available > 0,
    });
  }
  items.sort((a, b) => (Number(b.inStock) - Number(a.inStock)) || (a.sellingPrice - b.sellingPrice));
  res.json({ items: items.slice(0, 30) });
});

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
    emailOrderUpdate(order);
    res.json({ order });
  } finally {
    await session.endSession();
  }
});