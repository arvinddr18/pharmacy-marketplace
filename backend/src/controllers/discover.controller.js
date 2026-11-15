import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { PHARMACY_STATUS } from '../config/constants.js';

/**
 * PUBLIC customer-facing discovery. No auth required to browse — customers can
 * search and see offers/shops without logging in (login is only needed to order).
 */

/** GET /api/discover/medicines?q=para — search the central catalogue. */
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
  const items = await query.limit(60);
  res.json({ items });
});

/**
 * GET /api/discover/medicines/:id/offers
 * Which approved pharmacies stock this medicine, with price + available stock,
 * cheapest first. Only active listings at approved pharmacies, with
 * non-expired, non-reserved stock counted.
 */
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

/**
 * GET /api/discover/pharmacies?q=abc
 * PUBLIC — list approved, active medical shops for the customer home page.
 * Optional name search. Returns light shop cards (no stock counts).
 */
export const listPharmacies = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const filter = { status: PHARMACY_STATUS.APPROVED, deletedAt: null };
  if (q && q.trim()) filter.name = { $regex: q.trim(), $options: 'i' };

  const items = await Pharmacy.find(filter)
    .sort({ name: 1 })
    .limit(60)
    .select('name address operatingHours logoUrl');

  res.json({ items });
});

/**
 * GET /api/discover/pharmacies/:id/products?q=para
 * PUBLIC — one approved shop plus its sellable products (active listings whose
 * catalogue entry is active), with price, MRP, Rx flag and available stock.
 * Optional name filter within the shop.
 */
export const pharmacyProducts = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({
    _id: req.params.id,
    status: PHARMACY_STATUS.APPROVED,
    deletedAt: null,
  }).select('name address operatingHours logoUrl phone');
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');

  const q = (req.query.q || '').trim().toLowerCase();

  const listings = await PharmacyMedicineListing.find({
    pharmacy: pharmacy._id,
    active: true,
    deletedAt: null,
  }).populate('medicine', 'name brand strength dosageForm packSize prescriptionRequired status deletedAt imageUrl');

  const now = new Date();
  const products = [];
  for (const l of listings) {
    const med = l.medicine;
    if (!med || med.deletedAt || med.status !== 'active') continue;
    if (q && !med.name.toLowerCase().includes(q)) continue;

    const batches = await InventoryBatch.find({ listing: l._id, deletedAt: null });
    const available = batches.reduce(
      (sum, b) => sum + (b.expiryDate > now ? Math.max(0, b.quantity - b.reserved) : 0),
      0
    );

    products.push({
      listingId: l._id,
      medicineId: med._id,
      name: med.name,
      brand: med.brand || '',
      strength: med.strength || '',
      dosageForm: med.dosageForm || '',
      packSize: med.packSize || '',
      imageUrl: med.imageUrl || '',
      mrp: l.mrp,
      sellingPrice: l.sellingPrice,
      prescriptionRequired: Boolean(l.prescriptionRequired || med.prescriptionRequired),
      available,
      inStock: available > 0,
    });
  }

  products.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ pharmacy, products });
});