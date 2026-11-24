import webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';

const PUB = process.env.VAPID_PUBLIC_KEY || '';
const PRIV = process.env.VAPID_PRIVATE_KEY || '';
const CONTACT = process.env.VAPID_CONTACT || 'mailto:indicure2026@gmail.com';

let configured = false;
if (PUB && PRIV) {
  try { webpush.setVapidDetails(CONTACT, PUB, PRIV); configured = true; }
  catch (e) { console.log('[push] VAPID config failed:', e.message); }
} else {
  console.log('[push] VAPID keys not set — web push disabled until VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are configured.');
}

export const vapidPublicKey = () => PUB;

export async function sendPushToUser(userId, payload) {
  if (!configured || !userId) return;
  let subs = [];
  try { subs = await PushSubscription.find({ user: userId }); } catch { return; }
  if (!subs.length) return;
  const data = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        try { await PushSubscription.deleteOne({ _id: s._id }); } catch {}
      }
    }
  }));
}