import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { PharmacyMembership } from '../models/PharmacyMembership.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES, PHARMACY_STATUS } from '../config/constants.js';

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