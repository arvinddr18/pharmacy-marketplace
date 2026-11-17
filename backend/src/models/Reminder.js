import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A customer's refill reminder for a past order. When nextDate arrives the
 * customer sees a "time to reorder" banner in the app and gets an email.
 * The order's items are snapshotted so "Order again" works straight from here.
 */
const reminderSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true, maxlength: 160 },
    items: [{
      listing: { type: Schema.Types.ObjectId },
      name: { type: String },
      unitPrice: { type: Number },
      quantity: { type: Number },
      prescriptionRequired: { type: Boolean },
    }],
    pharmacyId: { type: Schema.Types.ObjectId },
    pharmacyName: { type: String },
    intervalDays: { type: Number, default: 30, min: 1, max: 365 },
    nextDate: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true },
    lastNotifiedAt: { type: Date },
  },
  { timestamps: true }
);

export const Reminder = model('Reminder', reminderSchema);