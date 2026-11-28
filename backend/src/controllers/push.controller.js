import { PushSubscription } from '../models/PushSubscription.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { vapidPublicKey, sendPushToUser } from '../services/push.service.js';

/** POST /api/push/test — send a test notification to the logged-in user. */
export const testPush = asyncHandler(async (req, res) => {
  const count = await PushSubscription.countDocuments({ user: req.user._id });
  await sendPushToUser(req.user._id, { title: 'Arnora 🔔', body: 'Notifications are working! You\'ll get order updates here.', url: '/' });
  res.json({ ok: true, devices: count });
});

export const getVapidKey = asyncHandler(async (_req, res) => {
  res.json({ key: vapidPublicKey() });
});

export const subscribePush = asyncHandler(async (req, res) => {
  const sub = req.body && req.body.subscription ? req.body.subscription : req.body;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: { message: 'Invalid subscription' } });
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    { user: req.user._id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ ok: true });
});

export const unsubscribePush = asyncHandler(async (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) await PushSubscription.deleteOne({ endpoint });
  res.json({ ok: true });
});