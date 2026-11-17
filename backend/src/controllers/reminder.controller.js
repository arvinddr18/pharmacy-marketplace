import { Reminder } from '../models/Reminder.js';
import { Order } from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DAY = 24 * 60 * 60 * 1000;

/** POST /api/customer/reminders { orderId, intervalDays } — set a refill reminder from a past order. */
export const createReminder = asyncHandler(async (req, res) => {
  const intervalDays = Math.min(365, Math.max(1, parseInt(req.body.intervalDays, 10) || 30));

  const order = await Order.findOne({ _id: req.body.orderId, customer: req.user._id })
    .populate('pharmacy', 'name')
    .lean();
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.items || !order.items.length) throw ApiError.badRequest('This order has no items to remind about');

  const items = order.items.map((it) => ({
    listing: it.listing, name: it.name, unitPrice: it.unitPrice, quantity: it.quantity, prescriptionRequired: it.prescriptionRequired,
  }));
  const label = items[0].name + (items.length > 1 ? ` +${items.length - 1} more` : '');

  const reminder = await Reminder.create({
    customer: req.user._id,
    label,
    items,
    pharmacyId: order.pharmacy && order.pharmacy._id,
    pharmacyName: order.pharmacy && order.pharmacy.name,
    intervalDays,
    nextDate: new Date(Date.now() + intervalDays * DAY),
    active: true,
  });
  res.status(201).json({ reminder });
});

/** GET /api/customer/reminders — this customer's active reminders, soonest first, each with a `due` flag. */
export const listReminders = asyncHandler(async (req, res) => {
  const items = await Reminder.find({ customer: req.user._id, active: true }).sort({ nextDate: 1 }).lean();
  const now = Date.now();
  res.json({ items: items.map((r) => ({ ...r, due: new Date(r.nextDate).getTime() <= now })) });
});

/** POST /api/customer/reminders/:id/snooze — push the reminder forward by one interval (e.g. after reordering). */
export const snoozeReminder = asyncHandler(async (req, res) => {
  const r = await Reminder.findOne({ _id: req.params.id, customer: req.user._id });
  if (!r) throw ApiError.notFound('Reminder not found');
  r.nextDate = new Date(Date.now() + (r.intervalDays || 30) * DAY);
  r.lastNotifiedAt = undefined;
  await r.save();
  res.json({ reminder: r });
});

/** DELETE /api/customer/reminders/:id — stop a reminder. */
export const deleteReminder = asyncHandler(async (req, res) => {
  const r = await Reminder.findOneAndDelete({ _id: req.params.id, customer: req.user._id });
  if (!r) throw ApiError.notFound('Reminder not found');
  res.json({ ok: true });
});