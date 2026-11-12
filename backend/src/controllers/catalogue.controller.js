import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
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