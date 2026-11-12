import { Pharmacy } from '../models/Pharmacy.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { PHARMACY_STATUS } from '../config/constants.js';

export const listPharmacies = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { deletedAt: null };
  if (status) {
    if (!Object.values(PHARMACY_STATUS).includes(status)) {
      throw ApiError.badRequest('Invalid status filter');
    }
    filter.status = status;
  }

  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));

  const [items, total] = await Promise.all([
    Pharmacy.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Pharmacy.countDocuments(filter),
  ]);

  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

export const getPharmacy = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ _id: req.params.id, deletedAt: null });
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');
  res.json({ pharmacy });
});

export const approvePharmacy = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ _id: req.params.id, deletedAt: null });
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');
  if (pharmacy.status === PHARMACY_STATUS.APPROVED) {
    return res.json({ pharmacy, message: 'Already approved' });
  }

  pharmacy.status = PHARMACY_STATUS.APPROVED;
  pharmacy.approvedAt = new Date();
  pharmacy.approvedBy = req.user._id;
  pharmacy.rejectionReason = undefined;
  await pharmacy.save();

  res.json({ pharmacy, message: 'Pharmacy approved' });
});

export const rejectPharmacy = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ _id: req.params.id, deletedAt: null });
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');

  pharmacy.status = PHARMACY_STATUS.REJECTED;
  pharmacy.rejectionReason = req.body.reason;
  await pharmacy.save();

  res.json({ pharmacy, message: 'Pharmacy rejected' });
});

export const suspendPharmacy = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ _id: req.params.id, deletedAt: null });
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');

  pharmacy.status = PHARMACY_STATUS.SUSPENDED;
  pharmacy.rejectionReason = req.body.reason;
  await pharmacy.save();

  res.json({ pharmacy, message: 'Pharmacy suspended' });
});

export const reactivatePharmacy = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ _id: req.params.id, deletedAt: null });
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');
  if (pharmacy.status !== PHARMACY_STATUS.SUSPENDED) {
    throw ApiError.badRequest('Only a suspended pharmacy can be reactivated');
  }

  pharmacy.status = PHARMACY_STATUS.APPROVED;
  pharmacy.rejectionReason = undefined;
  await pharmacy.save();

  res.json({ pharmacy, message: 'Pharmacy reactivated' });
});