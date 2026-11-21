import { z } from 'zod';

const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const registerPharmacySchema = z.object({
  pharmacyName: z.string().trim().min(2).max(160),
  ownerName: z.string().trim().min(2).max(120),
  email: z.email().trim(),
  phone,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  address: z.object({
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().default('Tarikere'),
    district: z.string().trim().optional(),
    state: z.string().trim().default('Karnataka'),
    pincode: z.string().regex(/^\d{6}$/, 'Invalid PIN code'),
  }),
  location: z
    .object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
    })
    .optional(),
  drugLicenceNumber: z.string().trim().min(5, 'Drug licence number is required'),
  gstNumber: z.string().trim().optional(),
  pharmacistName: z.string().trim().min(2, 'Pharmacist name is required'),
  pharmacistRegNumber: z.string().trim().min(3, 'Pharmacist registration number is required'),
});

export const rejectPharmacySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const suspendPharmacySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});