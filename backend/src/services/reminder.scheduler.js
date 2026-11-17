import { Reminder } from '../models/Reminder.js';
import { sendRefillReminderEmail } from './email.service.js';

const CHECK_EVERY_MS = 3 * 60 * 60 * 1000; // every 3 hours

/**
 * Finds due refill reminders and emails the customer once per due cycle.
 * Runs in-process (no separate cron service). Reminders stay "due" in the app
 * until the customer reorders (snooze) or removes them.
 */
async function runOnce() {
  try {
    const now = new Date();
    const due = await Reminder.find({ active: true, nextDate: { $lte: now } })
      .populate('customer', 'email name')
      .limit(200);

    for (const r of due) {
      if (r.lastNotifiedAt && r.lastNotifiedAt >= r.nextDate) continue;
      const email = r.customer && r.customer.email;
      if (email) {
        await sendRefillReminderEmail(email, r.customer.name, r.label);
      }
      r.lastNotifiedAt = now;
      await r.save();
    }
    if (due.length) console.log(`[reminders] processed ${due.length} due reminder(s)`);
  } catch (e) {
    console.log('[reminders] run failed:', e.message);
  }
}

export function startReminderScheduler() {
  setTimeout(runOnce, 30 * 1000);
  setInterval(runOnce, CHECK_EVERY_MS);
  console.log('[reminders] refill-reminder scheduler started');
}