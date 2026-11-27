import crypto from 'crypto';
import { User } from '../models/User.js';
import { ROLES, ACCOUNT_STATUS } from '../config/constants.js';

const DEMO_EMAILS = ['admin@pharmacy.test', 'owner.a@pharmacy.test', 'owner.b@pharmacy.test'];

export async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password) {
    try {
      let u = await User.findOne({ email });
      if (!u) u = new User({ name: 'IndiCure Admin', email, role: ROLES.SUPER_ADMIN, emailVerified: true, status: ACCOUNT_STATUS.ACTIVE });
      else { u.role = ROLES.SUPER_ADMIN; u.emailVerified = true; u.status = ACCOUNT_STATUS.ACTIVE; }
      await u.setPassword(password);
      await u.save();
      console.log(`[admin] super-admin ready: ${email}`);
    } catch (e) { console.log('[admin] ensureAdmin failed:', e.message); }
  }
  if (process.env.DISABLE_DEMO_ACCOUNTS === 'true') {
    try {
      for (const de of DEMO_EMAILS) {
        if (de === email) continue;
        const u = await User.findOne({ email: de });
        if (u) { await u.setPassword(crypto.randomBytes(24).toString('hex')); u.status = ACCOUNT_STATUS.DISABLED; await u.save(); }
      }
      console.log('[admin] demo accounts locked');
    } catch (e) { console.log('[admin] disable demo failed:', e.message); }
  }
}