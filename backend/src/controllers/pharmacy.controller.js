import { Pharmacy } from '../models/Pharmacy.js';
import { Order } from '../models/Order.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getMyPharmacy = asyncHandler(async (req, res) => {
  res.json({ pharmacy: req.pharmacy });
});

export const listMyPharmacyOrders = asyncHandler(async (req, res) => {
  const filter = { pharmacy: req.pharmacyId };
  if (req.query.status) filter.status = req.query.status;
  const orders = await Order.find(filter)
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ items: orders });
});

export const getPharmacyByIdScoped = asyncHandler(async (req, res, next) => {
  if (String(req.params.id) !== String(req.pharmacyId)) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  res.json({ pharmacy });
});