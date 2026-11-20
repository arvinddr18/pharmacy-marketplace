import { Pharmacy } from '../models/Pharmacy.js';
import { Order } from '../models/Order.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const getMyPharmacy = asyncHandler(async (req, res) => {
  res.json({ pharmacy: req.pharmacy });
});

/**
 * PATCH /api/pharmacy/me/location { lat, lng } — the pharmacy sets its exact
 * GPS location (tapped from their device at the shop) for "near me" search.
 */
export const updateMyLocation = asyncHandler(async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw ApiError.badRequest('Invalid location coordinates');
  }
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');
  pharmacy.location = { type: 'Point', coordinates: [lng, lat] };
  await pharmacy.save();
  res.json({ pharmacy });
});

export const listMyPharmacyOrders = asyncHandler(async (req, res) => {
  const filter = { pharmacy: req.pharmacyId };
  if (req.query.status) filter.status = req.query.status;
  const orders = await Order.find(filter)
    .select('-prescriptionImage')
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ items: orders });
});

export const getOrderPrescription = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, pharmacy: req.pharmacyId })
    .select('orderNumber prescriptionImage');
  if (!order) return res.status(404).json({ error: { message: 'Not found' } });
  res.json({ orderNumber: order.orderNumber, prescriptionImage: order.prescriptionImage || null });
});

export const getPharmacyByIdScoped = asyncHandler(async (req, res, next) => {
  if (String(req.params.id) !== String(req.pharmacyId)) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  res.json({ pharmacy });
});