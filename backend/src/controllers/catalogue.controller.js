import { MedicineCatalogue, CATALOGUE_CATEGORIES } from '../models/MedicineCatalogue.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const searchCatalogue = asyncHandler(async (req, res) => {
  const { q, status } = req.query;
  const filter = { deletedAt: null };
  if (status) filter.status = status;
  else filter.status = { $ne: 'inactive' };

  let query;
  if (q && q.trim()) {
    filter.$text = { $search: q.trim() };
    query = MedicineCatalogue.find(filter, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });
  } else {
    query = MedicineCatalogue.find(filter).sort({ name: 1 });
  }

  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));

  const [items, total] = await Promise.all([
    query.skip((page - 1) * limit).limit(limit),
    MedicineCatalogue.countDocuments(filter),
  ]);

  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

export const getCatalogueItem = asyncHandler(async (req, res) => {
  const item = await MedicineCatalogue.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) throw ApiError.notFound('Medicine not found');
  res.json({ medicine: item });
});

export const createCatalogueItem = asyncHandler(async (req, res) => {
  const item = await MedicineCatalogue.create({ ...req.body, status: 'active' });
  res.status(201).json({ medicine: item });
});

/** Admin: set Rx/OTC on all catalogue entries matching a search (or all if no query). */
export const bulkSetRx = asyncHandler(async (req, res) => {
  const value = req.body.prescriptionRequired;
  if (typeof value !== 'boolean') throw ApiError.badRequest('prescriptionRequired must be true or false');
  const q = (req.body.q || '').trim();
  const filter = { deletedAt: null, status: { $ne: 'inactive' } };
  if (q) filter.$text = { $search: q };
  const r = await MedicineCatalogue.updateMany(filter, { $set: { prescriptionRequired: value } });
  res.json({ updated: r.modifiedCount ?? r.nModified ?? 0 });
});

/** Admin: set category on all catalogue entries matching a search (or all if no query). */
export const bulkSetCategory = asyncHandler(async (req, res) => {
  const category = (req.body.category || '').trim();
  if (!CATALOGUE_CATEGORIES.includes(category)) throw ApiError.badRequest('Invalid category');
  const q = (req.body.q || '').trim();
  const filter = { deletedAt: null, status: { $ne: 'inactive' } };
  if (q) filter.$text = { $search: q };
  const r = await MedicineCatalogue.updateMany(filter, { $set: { category } });
  res.json({ updated: r.modifiedCount ?? r.nModified ?? 0 });
});

/** Admin: bulk-insert catalogue entries (medicine-library import). Skips existing names. */
export const bulkCreateCatalogue = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw ApiError.badRequest('No items provided');
  if (items.length > 1000) throw ApiError.badRequest('Max 1000 items per request');

  const existing = await MedicineCatalogue.find({ deletedAt: null }).select('name').lean();
  const have = new Set(existing.map((e) => (e.name || '').toLowerCase()));

  const ALLOWED = ['name', 'brand', 'genericName', 'manufacturer', 'strength', 'dosageForm', 'packSize', 'prescriptionRequired', 'scheduleCategory', 'description'];
  const toInsert = [];
  const seen = new Set();
  for (const raw of items) {
    const name = (raw && raw.name ? String(raw.name) : '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    const doc = { name, status: 'active' };
    for (const k of ALLOWED) if (k !== 'name' && raw[k] !== undefined) doc[k] = raw[k];
    toInsert.push(doc);
  }

  let added = 0;
  if (toInsert.length) {
    try {
      const inserted = await MedicineCatalogue.insertMany(toInsert, { ordered: false });
      added = inserted.length;
    } catch (e) {
      added = (e && e.insertedDocs && e.insertedDocs.length) || 0; // count partial successes
    }
  }
  res.json({ added, skipped: items.length - added });
});

export const updateCatalogueItem = asyncHandler(async (req, res) => {
  const item = await MedicineCatalogue.findOneAndUpdate(
    { _id: req.params.id, deletedAt: null },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!item) throw ApiError.notFound('Medicine not found');
  res.json({ medicine: item });
});

export const approveCatalogueItem = asyncHandler(async (req, res) => {
  const item = await MedicineCatalogue.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) throw ApiError.notFound('Medicine not found');
  item.status = 'active';
  await item.save();
  res.json({ medicine: item, message: 'Catalogue entry approved' });
});

export const deleteCatalogueItem = asyncHandler(async (req, res) => {
  const item = await MedicineCatalogue.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) throw ApiError.notFound('Medicine not found');
  item.deletedAt = new Date();
  item.status = 'inactive';
  await item.save();
  res.json({ message: 'Catalogue entry removed' });
});