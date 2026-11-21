import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * The CENTRAL, shared medicine catalogue — one entry per distinct medicine
 * product. It is independent of any pharmacy's stock: many pharmacies can
 * list and stock the same catalogue entry at their own prices and quantities.
 *
 * Only platform admins manage this collection. Pharmacies select from it (and
 * can submit new entries for admin review via `status`).
 */
const DOSAGE_FORMS = [
  'tablet', 'capsule', 'syrup', 'suspension', 'injection', 'drops',
  'cream', 'ointment', 'gel', 'inhaler', 'powder', 'sachet', 'other',
];

// Product categories the shop sells (medicines + the wider pharmacy range).
const CATEGORIES = ['medicine', 'personal_care', 'baby', 'nutrition', 'devices', 'pet'];

const catalogueSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    brand: { type: String, trim: true, maxlength: 200 },
    genericName: { type: String, trim: true, maxlength: 200, index: true },
    manufacturer: { type: String, trim: true, maxlength: 200 },
    strength: { type: String, trim: true, maxlength: 60 },
    dosageForm: { type: String, enum: DOSAGE_FORMS, default: 'other' },
    packSize: { type: String, trim: true, maxlength: 60 }, // e.g. "10 tablets"

    // What kind of product this is (medicine, personal care, baby, pet, …).
    category: { type: String, enum: CATEGORIES, default: 'medicine', index: true },

    prescriptionRequired: { type: Boolean, default: false },
    scheduleCategory: { type: String, trim: true },

    imageUrl: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 2000 },

    status: { type: String, enum: ['active', 'pending', 'inactive'], default: 'active', index: true },
    submittedByPharmacy: { type: Schema.Types.ObjectId, ref: 'Pharmacy' },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

catalogueSchema.index({ name: 'text', brand: 'text', genericName: 'text', manufacturer: 'text' });

export const MedicineCatalogue = model('MedicineCatalogue', catalogueSchema);
export const CATALOGUE_DOSAGE_FORMS = DOSAGE_FORMS;
export const CATALOGUE_CATEGORIES = CATEGORIES;