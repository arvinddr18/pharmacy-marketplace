import { ensureAdmin } from './utils/ensureAdmin.js';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { startReminderScheduler } from './services/reminder.scheduler.js';

async function start() {
  await connectDB();
  await ensureAdmin();
  const app = createApp();
  startReminderScheduler();

  const server = app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
    if (!env.features.liveOrders) {
      console.log('[server] FEATURE_LIVE_ORDERS is OFF — live medicine ordering disabled pending legal clearance');
    }
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
