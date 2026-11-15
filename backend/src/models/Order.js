import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const ORDER_STATUS = Object.freeze({
  PLACED: 'placed',
  ACCEPTED: 'accepted',
  READY: 'ready',
  ASSIGNED: 'assigned',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const itemSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'PharmacyMedicineListing', required: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'MedicineCatalogue', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    prescriptionRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const reservationSchema = new Schema(
  { batch: { type: Schema.Types.ObjectId, ref: 'InventoryBatch', required: true }, quantity: { type: Number, required: true } },
  { _id: false }
);

const timelineSchema = new Schema(
  { status: String, at: { type: Date, default: Date.now }, note: String },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pharmacy: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },

    items: { type: [itemSchema], required: true },
    reservations: { type: [reservationSchema], default: [] },

    itemsTotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    deliveryAddress: {
      line1: String, city: String, pincode: String, phone: String, instructions: String,
    },

    prescriptionRequired: { type: Boolean, default: false },
    prescriptionImage: { type: String },
    hasPrescription: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PLACED, index: true },
    rejectionReason: { type: String },

    rider: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    deliveryOtp: { type: String },

    isDemo: { type: Boolean, default: true },
    timeline: { type: [timelineSchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ pharmacy: 1, status: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });

export const Order = model('Order', orderSchema);