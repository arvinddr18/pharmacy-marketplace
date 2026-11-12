import { Pharmacy } from '../models/Pharmacy.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/pharmacy/me — returns the tenant resolved by resolvePharmacy.
 * Because req.pharmacyId comes from the authenticated user's membership,
 * this can only ever return the caller's own pharmacy.
 */
export const getMyPharmacy = asyncHandler(async (req, res) => {
  res.json({ pharmacy: req.pharmacy });
});

/**
 * GET /api/pharmacy/orders — placeholder tenant-scoped list. The important
 * part is that the query is scoped to req.pharmacyId, never a client value.
 * (Order model arrives in a later phase; this proves the scoping pattern.)
 */
export const listMyPharmacyOrders = asyncHandler(async (req, res) => {
  // Example of the mandatory pattern: ALWAYS filter by req.pharmacyId.
  // const orders = await Order.find({ pharmacy: req.pharmacyId });
  res.json({
    pharmacyId: req.pharmacyId,
    orders: [],
    note: 'Order model is implemented in a later phase; scoping pattern shown.',
  });
});

/**
 * GET /api/pharmacy/:id — deliberately demonstrates the isolation rule:
 * a pharmacy user may fetch ONLY their own pharmacy by id. Any other id 404s.
 */
export const getPharmacyByIdScoped = asyncHandler(async (req, res, next) => {
  if (String(req.params.id) !== String(req.pharmacyId)) {
    // Do not confirm another tenant's existence.
    return res.status(404).json({ error: { message: 'Not found' } });
  }
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  res.json({ pharmacy });
});
