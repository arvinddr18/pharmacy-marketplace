import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A pharmacy's decision to sell a catalogue medicine, with ITS OWN price.
 * Tenant-scoped: every listing references a pharmacy, and all queries must
 * filter by req.pharmacyId. Stock quantity is NOT stored here — it is derived
 * from InventoryBatch so batch/expiry remain the single source of truth.
 */
const listingSchema = new Schema(
  {
    pharmacy: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'MedicineCatalogue', required: true, index: true },

    mrp: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },

    prescriptionRequired: { type: Boolean, default: false },

    active: { type: Boolean, default: true },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

listingSchema.index({ pharmacy: 1, medicine: 1 }, { unique: true });

listingSchema.pre('validate', function enforcePrice(next) {
  if (this.sellingPrice != null && this.mrp != null && this.sellingPrice > this.mrp) {
    return next(new Error('Selling price cannot exceed MRP'));
  }
  next();
});

export const PharmacyMedicineListing = model('PharmacyMedicineListing', listingSchema);