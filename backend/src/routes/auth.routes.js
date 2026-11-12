import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requestOtpHandler,
  verifyOtpHandler,
  dashboardLoginHandler,
  refreshHandler,
  meHandler,
} from '../controllers/auth.controller.js';
import {
  validateBody,
  requestOtpSchema,
  verifyOtpSchema,
  dashboardLoginSchema,
  refreshSchema,
} from '../validators/auth.validators.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Tighter limit on auth endpoints to slow brute force / OTP abuse.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/otp/request', authLimiter, validateBody(requestOtpSchema), requestOtpHandler);
router.post('/otp/verify', authLimiter, validateBody(verifyOtpSchema), verifyOtpHandler);
router.post('/login', authLimiter, validateBody(dashboardLoginSchema), dashboardLoginHandler);
router.post('/refresh', validateBody(refreshSchema), refreshHandler);
router.get('/me', authenticate, meHandler);

export default router;
