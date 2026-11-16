import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A customer's rating + review of a pharmacy, tied to one delivered order.
 * One review per order (unique index), so a rating always reflects a real,
 * completed purchase.
 */
const reviewSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pharmacy: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    customerName: { type: String, trim: true, maxlength: 120 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

reviewSchema.index({ pharmacy: 1, createdAt: -1 });

/**
 * Average rating + review count for a set of pharmacy ids.
 * Returns a Map keyed by pharmacy id string: { avg, count }.
 */
reviewSchema.statics.ratingsFor = async function ratingsFor(pharmacyIds) {
  const map = {};
  if (!pharmacyIds || !pharmacyIds.length) return map;
  const rows = await this.aggregate([
    { $match: { pharmacy: { $in: pharmacyIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    { $group: { _id: '$pharmacy', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  for (const r of rows) {
    map[String(r._id)] = { avg: Math.round(r.avg * 10) / 10, count: r.count };
  }
  return map;
};

export const Review = model('Review', reviewSchema);