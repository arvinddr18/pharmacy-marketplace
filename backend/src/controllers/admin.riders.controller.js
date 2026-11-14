import { User } from '../models/User.js';
import { Order, ORDER_STATUS } from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES, ACCOUNT_STATUS } from '../config/constants.js';

export const listRiders = asyncHandler(async (req, res) => {
  const riders = await User.find({ role: ROLES.RIDER, deletedAt: null }).sort({ createdAt: -1 });
  res.json({ items: riders.map((r) => r.toSafeJSON()) });
});

export const createRider = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    throw ApiError.badRequest('Name, email and a password of at least 8 characters are required');
  }
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const rider = new User({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone?.trim(),
    role: ROLES.RIDER,
    emailVerified: true,
  });
  await rider.setPassword(password);
  await rider.save();
  res.status(201).json({ rider: rider.toSafeJSON() });
});

export const assignRider = asyncHandler(async (req, res) => {
  const { riderId } = req.body;
  const rider = await User.findOne({ _id: riderId, role: ROLES.RIDER, deletedAt: null });
  if (!rider || rider.status === ACCOUNT_STATUS.DISABLED) throw ApiError.badRequest('Rider not found or disabled');

  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (![ORDER_STATUS.READY, ORDER_STATUS.ASSIGNED].includes(order.status)) {
    throw ApiError.badRequest('Only a ready order can be assigned to a rider');
  }

  order.rider = rider._id;
  order.status = ORDER_STATUS.ASSIGNED;
  order.timeline.push({ status: ORDER_STATUS.ASSIGNED, at: new Date(), note: `Assigned to rider ${rider.name}` });
  await order.save();

  res.json({ order, message: `Assigned to ${rider.name}` });
});