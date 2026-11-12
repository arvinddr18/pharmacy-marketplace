import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// All handlers run AFTER resolvePharmacy, so req.pharmacyId is the authenticated
// pharmacy. Every query is scoped to it.

export const listListings = asyncHandler(async (req, res) => {
  const listings = await PharmacyMedicineListing.find({ pharmacy: req.pharmacyId, deletedAt: null })
    .populate('medicine', 'name brand genericName strength dosageForm packSize prescriptionRequired')
    .sort({ createdAt: -1 });
  res.json({ items: listings });
});

export const createListing = asyncHandler(async (req, res) => {
  const { medicineId, mrp, sellingPrice } = req.body;

  const medicine = await MedicineCatalogue.findOne({ _id: medicineId, deletedAt: null, status: 'active' });
  if (!medicine) throw ApiError.badRequest('Medicine not found in catalogue or not active');

  if (sellingPrice > mrp) throw ApiError.badRequest('Selling price cannot exceed MRP');

  const prescriptionRequired = medicine.prescriptionRequired || Boolean(req.body.prescriptionRequired);

  try {
    const listing = await PharmacyMedicineListing.create({
      pharmacy: req.pharmacyId,
      medicine: medicine._id,
      mrp,
      sellingPrice,
      prescriptionRequired,
      active: req.body.active ?? true,
    });
    res.status(201).json({ listing });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('This medicine is already listed by your pharmacy');
    throw err;
  }
});

export const updateListing = asyncHandler(async (req, res) => {
  const listing = await PharmacyMedicineListing.findOne({
    _id: req.params.id,
    pharmacy: req.pharmacyId,
    deletedAt: null,
  }).populate('medicine', 'prescriptionRequired');
  if (!listing) throw ApiError.notFound('Listing not found');

  const { mrp, sellingPrice, active } = req.body;
  if (mrp != null) listing.mrp = mrp;
  if (sellingPrice != null) listing.sellingPrice = sellingPrice;
  if (active != null) listing.active = active;

  if (req.body.prescriptionRequired != null) {
    listing.prescriptionRequired = listing.medicine.prescriptionRequired || req.body.prescriptionRequired;
  }

  await listing.save();
  res.json({ listing });
});

export const deleteListing = asyncHandler(async (req, res) => {
  const listing = await PharmacyMedicineListing.findOne({
    _id: req.params.id,
    pharmacy: req.pharmacyId,
    deletedAt: null,
  });
  if (!listing) throw ApiError.notFound('Listing not found');
  listing.deletedAt = new Date();
  listing.active = false;
  await listing.save();
  res.json({ message: 'Listing removed' });
});

export const listBatches = asyncHandler(async (req, res) => {
  const listing = await PharmacyMedicineListing.findOne({
    _id: req.params.id,
    pharmacy: req.pharmacyId,
    deletedAt: null,
  });
  if (!listing) throw ApiError.notFound('Listing not found');

  const batches = await InventoryBatch.find({
    listing: listing._id,
    pharmacy: req.pharmacyId,
    deletedAt: null,
  }).sort({ expiryDate: 1 });

  const now = new Date();
  const availableTotal = batches.reduce(
    (sum, b) => sum + (b.expiryDate > now ? Math.max(0, b.quantity - b.reserved) : 0),
    0
  );

  res.json({ availableTotal, batches });
});

export const createBatch = asyncHandler(async (req, res) => {
  const listing = await PharmacyMedicineListing.findOne({
    _id: req.params.id,
    pharmacy: req.pharmacyId,
    deletedAt: null,
  });
  if (!listing) throw ApiError.notFound('Listing not found');

  const { expiryDate } = req.body;
  if (new Date(expiryDate) <= new Date()) {
    throw ApiError.badRequest('Expiry date must be in the future — expired stock cannot be added');
  }

  const batch = await InventoryBatch.create({
    pharmacy: req.pharmacyId,
    listing: listing._id,
    medicine: listing.medicine,
    batchNumber: req.body.batchNumber,
    manufacturingDate: req.body.manufacturingDate,
    expiryDate,
    quantity: req.body.quantity,
    purchasePrice: req.body.purchasePrice,
  });

  res.status(201).json({ batch });
});

export const adjustBatch = asyncHandler(async (req, res) => {
  const { delta } = req.body;

  const batch = await InventoryBatch.findOne({
    _id: req.params.id,
    pharmacy: req.pharmacyId,
    deletedAt: null,
  });
  if (!batch) throw ApiError.notFound('Batch not found');

  const newQty = batch.quantity + delta;
  if (newQty < 0) throw ApiError.badRequest('Adjustment would make stock negative');
  if (newQty < batch.reserved) {
    throw ApiError.badRequest('Cannot reduce below units already reserved for orders');
  }

  batch.quantity = newQty;
  await batch.save();
  res.json({ batch });
});