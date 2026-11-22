import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import pharmacyRoutes from './routes/pharmacy.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import adminRoutes from './routes/admin.routes.js';
import catalogueRoutes from './routes/catalogue.routes.js';
import discoverRoutes from './routes/discover.routes.js';
import orderRoutes from './routes/order.routes.js';
import accountRoutes from './routes/account.routes.js';
import riderRoutes from './routes/rider.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));

  // Allow any origin. Auth uses Bearer tokens (not cookies), so this is safe,
  // and it lets the served dashboard and future frontends call the API freely.
  app.use(cors({ origin: true, credentials: true }));

  app.use(express.json({ limit: '5mb' }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.use(rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', env: env.nodeEnv, liveOrders: env.features.liveOrders, time: new Date().toISOString() })
  );

  // Serve the pharmacy dashboard web page from backend/public at "/".
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pub = path.join(here, '..', 'public');

  // One public link ("/") opens the customer shop, like flipkart.com.
  // Staff get clean routes; a smart login sends each person to the right one.
  app.get('/', (_req, res) => res.sendFile(path.join(pub, 'shop.html')));
  app.get('/pharmacy', (_req, res) => res.sendFile(path.join(pub, 'index.html')));
  app.get('/admin', (_req, res) => res.sendFile(path.join(pub, 'admin.html')));
  app.get('/rider', (_req, res) => res.sendFile(path.join(pub, 'rider.html')));

  app.use(express.static(pub));

  app.use('/api/auth', authRoutes);
  app.use('/api/register', registrationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/catalogue', catalogueRoutes);
  app.use('/api/discover', discoverRoutes);
  app.use('/api/customer', orderRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/rider', riderRoutes);
  app.use('/api/pharmacy', pharmacyRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}