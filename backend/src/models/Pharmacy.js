import mongoose from 'mongoose';
import { PHARMACY_STATUS } from '../config/constants.js';

const { Schema, model } = mongoose;

/**
 * A Pharmacy is a tenant. All pharmacy-scoped data (inventory, orders,
 * reports) references this _id and access is resolved server-side from the
 * authenticated user's membership — never from a client-supplied pharmacyId.
 */
const pharmacySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, trim: true, lowercase: true, index: true, unique: true, sparse: true },

    ownerName: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },

    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true, default: 'Tarikere' },
      district: { type: String, trim: true },
      state: { type: String, trim: true, default: 'Karnataka' },
      pincode: { type: String, trim: true, match: [/^\d{6}$/, 'Invalid PIN code'] },
    },

    // GeoJSON point for proximity queries. [longitude, latitude].
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },

    logoUrl: { type: String, trim: true },

    // Licence/compliance details — stored but not auto-trusted. Admin verifies.
    drugLicenceNumber: { type: String, trim: true },
    gstNumber: { type: String, trim: true },
    pharmacistName: { type: String, trim: true },
    pharmacistRegNumber: { type: String, trim: true },

    operatingHours: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '21:00' },
    },

    status: {
      type: String,
      enum: Object.values(PHARMACY_STATUS),
      default: PHARMACY_STATUS.PENDING,
      index: true,
    },
    rejectionReason: { type: String, trim: true },

    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

pharmacySchema.index({ location: '2dsphere' });
pharmacySchema.index({ 'address.pincode': 1, status: 1 });

export const Pharmacy = model('Pharmacy', pharmacySchema);
