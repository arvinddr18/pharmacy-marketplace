import crypto from 'crypto';
import { User } from '../models/User.js';
import { ROLES, ACCOUNT_STATUS } from '../config/constants.js';

/**
 * Startup security helper (safe to leave in permanently):
 *  - ADMIN_EMAIL + ADMIN_PASSWORD  → create/refresh your real super-admin.
 *  - DISABLE_DEMO_ACCOUNTS === 'true' → lock the public demo ADMIN login.
 *  - DEMO_PHARMACY_PASSWORD → keep the demo pharmacy logins (owner.a / owner.b)
 *    working for testing, but with a secret password you choose (data kept).
 * Does nothing unless the matching env vars are set.
 */
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
      const u = await User.findOne({ email: 'admin@pharmacy.test' });
      if (u && u.email !== email) { await u.setPassword(crypto.randomBytes(24).toString('hex')); u.status = ACCOUNT_STATUS.DISABLED; await u.save(); }
      console.log('[admin] demo admin locked');
    } catch (e) { console.log('[admin] disable demo admin failed:', e.message); }
  }

  const demoPharmaPw = process.env.DEMO_PHARMACY_PASSWORD || '';
  if (demoPharmaPw) {
    try {
      for (const de of ['owner.a@pharmacy.test', 'owner.b@pharmacy.test']) {
        const u = await User.findOne({ email: de });
        if (u) { await u.setPassword(demoPharmaPw); u.status = ACCOUNT_STATUS.ACTIVE; await u.save(); }
      }
      console.log('[admin] demo pharmacy passwords updated');
    } catch (e) { console.log('[admin] demo pharmacy update failed:', e.message); }
  }
}