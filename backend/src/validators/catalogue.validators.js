import { z } from 'zod';
import { CATALOGUE_DOSAGE_FORMS } from '../models/MedicineCatalogue.js';

export const createCatalogueSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).optional(),
  genericName: z.string().trim().max(200).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  strength: z.string().trim().max(60).optional(),
  dosageForm: z.enum(CATALOGUE_DOSAGE_FORMS).optional(),
  packSize: z.string().trim().max(60).optional(),
  prescriptionRequired: z.boolean().optional(),
  scheduleCategory: z.string().trim().max(10).optional(),
  imageUrl: z.string().url().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const updateCatalogueSchema = createCatalogueSchema.partial();

export const createListingSchema = z.object({
  medicineId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid medicine id'),
  mrp: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  prescriptionRequired: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateListingSchema = z.object({
  mrp: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  prescriptionRequired: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const createBatchSchema = z.object({
  batchNumber: z.string().trim().min(1).max(100),
  manufacturingDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  quantity: z.number().int().nonnegative(),
  purchasePrice: z.number().nonnegative().optional(),
});

export const adjustBatchSchema = z.object({
  delta: z.number().int(),
  reason: z.string().trim().max(200).optional(),
});