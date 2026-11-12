import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A physical stock batch of a listed medicine at one pharmacy. Tenant-scoped.
 * Stock lives here (not on the listing) so expiry is always tied to the exact
 * units. Available = sum of quantity over non-expired, non-deleted batches.
 */
const batchSchema = new Schema(
  {
    pharmacy: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    listing: { type: Schema.Types.ObjectId, ref: 'PharmacyMedicineListing', required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'MedicineCatalogue', required: true },

    batchNumber: { type: String, required: true, trim: true, maxlength: 100 },
    manufacturingDate: { type: Date },
    expiryDate: { type: Date, required: true, index: true },

    quantity: { type: Number, required: true, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    purchasePrice: { type: Number, min: 0 },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

batchSchema.index({ pharmacy: 1, listing: 1, expiryDate: 1 });

batchSchema.pre('validate', function checkDates(next) {
  if (this.manufacturingDate && this.expiryDate && this.manufacturingDate > this.expiryDate) {
    return next(new Error('Manufacturing date cannot be after expiry date'));
  }
  if (this.reserved > this.quantity) {
    return next(new Error('Reserved units cannot exceed quantity on hand'));
  }
  next();
});

batchSchema.virtual('available').get(function available() {
  if (this.expiryDate && this.expiryDate <= new Date()) return 0;
  return Math.max(0, this.quantity - this.reserved);
});

batchSchema.set('toJSON', { virtuals: true });
batchSchema.set('toObject', { virtuals: true });

export const InventoryBatch = model('InventoryBatch', batchSchema);