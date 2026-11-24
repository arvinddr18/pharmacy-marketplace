import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { PharmacyMembership } from '../models/PharmacyMembership.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES, PHARMACY_STATUS, ACCOUNT_STATUS } from '../config/constants.js';

export const registerPharmacy = asyncHandler(async (req, res) => {
  const b = req.body;

  const existing = await User.findOne({ email: b.email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const [pharmacy] = await Pharmacy.create(
        [
          {
            name: b.pharmacyName,
            ownerName: b.ownerName,
            email: b.email,
            phone: b.phone,
            address: b.address,
            location: b.location
              ? { type: 'Point', coordinates: [b.location.lng, b.location.lat] }
              : undefined,
            drugLicenceNumber: b.drugLicenceNumber,
            gstNumber: b.gstNumber,
            pharmacistName: b.pharmacistName,
            pharmacistRegNumber: b.pharmacistRegNumber,
            status: PHARMACY_STATUS.PENDING,
          },
        ],
        { session }
      );

      const owner = new User({
        name: b.ownerName,
        email: b.email,
        phone: b.phone,
        role: ROLES.PHARMACY_OWNER,
      });
      await owner.setPassword(b.password);
      await owner.save({ session });

      await PharmacyMembership.create(
        [{ user: owner._id, pharmacy: pharmacy._id, role: ROLES.PHARMACY_OWNER }],
        { session }
      );

      created = { pharmacy, owner };
    });

    res.status(201).json({
      message: 'Registration received. Your pharmacy is pending admin approval.',
      pharmacy: {
        id: created.pharmacy._id,
        name: created.pharmacy.name,
        status: created.pharmacy.status,
      },
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('Email or phone already registered');
    throw err;
  } finally {
    await session.endSession();
  }
});


/**
 * POST /api/register/rider  (public)
 * A delivery rider applies to join. Account is created PENDING and cannot
 * log in until an admin approves it.
 */
export const registerRider = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const area = String(req.body.area || '').trim().slice(0, 120);
  const vehicle = String(req.body.vehicle || '').trim().slice(0, 60);

  if (name.length < 2) throw ApiError.badRequest('Please enter your name');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw ApiError.badRequest('Enter a valid email');
  if (!/^[6-9]\d{9}$/.test(phone)) throw ApiError.badRequest('Enter a valid 10-digit mobile number');
  if (password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const rider = new User({
    name, email, phone,
    role: ROLES.RIDER,
    status: ACCOUNT_STATUS.PENDING,
    emailVerified: true,
    savedSearches: [area, vehicle].filter(Boolean).map((s) => s.slice(0, 60)),
  });
  await rider.setPassword(password);
  await rider.save();

  res.status(201).json({ message: 'Application received! We will review it and activate your rider account soon.' });
});