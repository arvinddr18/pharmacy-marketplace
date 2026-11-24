// Shared enums and constants used across models, validators and middleware.

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  PHARMACY_OWNER: 'pharmacy_owner',
  PHARMACY_STAFF: 'pharmacy_staff',
  RIDER: 'rider',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

export const ROLE_VALUES = Object.values(ROLES);

// Roles that operate inside a pharmacy tenant boundary.
export const PHARMACY_ROLES = Object.freeze([ROLES.PHARMACY_OWNER, ROLES.PHARMACY_STAFF]);

// Platform-level staff who may cross tenant boundaries by design.
export const PLATFORM_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

export const PHARMACY_STATUS = Object.freeze({
  PENDING: 'pending', // registered, awaiting admin approval
  APPROVED: 'approved', // approved, can operate
  SUSPENDED: 'suspended', // temporarily disabled by admin
  REJECTED: 'rejected', // registration declined
});

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  DISABLED: 'disabled',
  PENDING: 'pending', // staff (e.g. rider) registered, awaiting admin approval
});
