import { PharmacyMembership } from '../models/PharmacyMembership.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { PHARMACY_STATUS, PLATFORM_ROLES, ROLES } from '../config/constants.js';

/**
 * Resolves the pharmacy tenant for a pharmacy-scoped request — from the
 * DATABASE, using the authenticated user's membership. It intentionally
 * ignores any pharmacyId in the URL, query or body.
 *
 * This is the core defence against cross-pharmacy access: Pharmacy A's user
 * physically cannot obtain a membership for Pharmacy B, so req.pharmacyId can
 * only ever be their own.
 *
 * After this runs, every tenant-scoped query MUST filter by req.pharmacyId.
 */
export const resolvePharmacy = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw ApiError.unauthorized();

  const membership = await PharmacyMembership.findOne({
    user: req.user._id,
    active: true,
  });

  if (!membership) {
    throw ApiError.forbidden('No active pharmacy membership for this account');
  }

  const pharmacy = await Pharmacy.findById(membership.pharmacy);
  if (!pharmacy || pharmacy.deletedAt) throw ApiError.notFound('Pharmacy not found');

  if (pharmacy.status !== PHARMACY_STATUS.APPROVED) {
    throw ApiError.forbidden(`Pharmacy is ${pharmacy.status}, not yet active`);
  }

  // Server-trusted tenant context. Downstream code uses ONLY these.
  req.pharmacy = pharmacy;
  req.pharmacyId = pharmacy._id;
  req.membership = membership;
  next();
});

/**
 * Guards a resource that belongs to a specific pharmacy. Platform admins may
 * pass (they legitimately cross tenants); a pharmacy user may only touch a
 * resource whose pharmacy matches their resolved tenant.
 *
 * @param {(req) => (string|ObjectId)} getResourcePharmacyId
 */
export const ensureSameTenant = (getResourcePharmacyId) =>
  asyncHandler(async (req, _res, next) => {
    if (PLATFORM_ROLES.includes(req.user?.role)) return next();

    const resourcePharmacyId = await getResourcePharmacyId(req);
    if (!resourcePharmacyId) throw ApiError.notFound();

    if (String(resourcePharmacyId) !== String(req.pharmacyId)) {
      // Do not reveal existence of another tenant's resource.
      throw ApiError.notFound();
    }
    next();
  });
