import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { PHARMACY_STATUS } from '../config/constants.js';

/** GET /api/discover/medicines?q=para — public catalogue search. */
export const searchMedicines = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const filter = { deletedAt: null, status: 'active' };
  let query;
  if (q && q.trim()) {
    filter.$text = { $search: q.trim() };
    query = MedicineCatalogue.find(filter);
  } else {
    query = MedicineCatalogue.find(filter).sort({ name: 1 });
  }
  const items = await query.limit(20);
  res.json({ items });
});

/** GET /api/discover/medicines/:id/offers — pharmacies stocking it, cheapest first. */
export const medicineOffers = asyncHandler(async (req, res) => {
  const medicine = await MedicineCatalogue.findOne({ _id: req.params.id, deletedAt: null });
  if (!medicine) throw ApiError.notFound('Medicine not found');

  const listings = await PharmacyMedicineListing.find({
    medicine: medicine._id,
    active: true,
    deletedAt: null,
  }).populate('pharmacy', 'name address status deletedAt');

  const now = new Date();
  const offers = [];
  for (const l of listings) {
    const ph = l.pharmacy;
    if (!ph || ph.deletedAt || ph.status !== PHARMACY_STATUS.APPROVED) continue;

    const batches = await InventoryBatch.find({ listing: l._id, deletedAt: null });
    const available = batches.reduce(
      (sum, b) => sum + (b.expiryDate > now ? Math.max(0, b.quantity - b.reserved) : 0),
      0
    );

    offers.push({
      listingId: l._id,
      pharmacyId: ph._id,
      pharmacyName: ph.name,
      city: ph.address?.city ?? '',
      mrp: l.mrp,
      sellingPrice: l.sellingPrice,
      prescriptionRequired: l.prescriptionRequired,
      available,
      inStock: available > 0,
    });
  }

  offers.sort((a, b) => a.sellingPrice - b.sellingPrice);
  res.json({ medicine, offers });
});