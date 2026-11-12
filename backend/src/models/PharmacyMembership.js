import mongoose from 'mongoose';
import { PHARMACY_ROLES } from '../config/constants.js';

const { Schema, model } = mongoose;

/**
 * The authoritative link between a user and a pharmacy tenant.
 *
 * This is the ONLY source of truth for "which pharmacy can this user act on".
 * The tenant middleware resolves a request's pharmacy from this collection
 * using the authenticated userId. The frontend never dictates tenant access.
 */
const membershipSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pharmacy: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    role: { type: String, enum: PHARMACY_ROLES, required: true },
    active: { type: Boolean, default: true },
    // Granular permissions for staff (owner implicitly has all).
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

// A user can hold only one membership row per pharmacy.
membershipSchema.index({ user: 1, pharmacy: 1 }, { unique: true });

export const PharmacyMembership = model('PharmacyMembership', membershipSchema);
