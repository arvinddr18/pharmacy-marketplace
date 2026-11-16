import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requestOtpHandler,
  verifyOtpHandler,
  dashboardLoginHandler,
  refreshHandler,
  meHandler,
  demoLoginHandler,
  registerCustomerHandler,
  verifyEmailHandler,
  resendVerificationHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
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

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/otp/request', authLimiter, validateBody(requestOtpSchema), requestOtpHandler);
router.post('/otp/verify', authLimiter, validateBody(verifyOtpSchema), verifyOtpHandler);
router.post('/register', authLimiter, registerCustomerHandler);
router.post('/verify-email', authLimiter, verifyEmailHandler);
router.post('/resend-verification', authLimiter, resendVerificationHandler);
router.post('/forgot-password', authLimiter, forgotPasswordHandler);
router.post('/reset-password', authLimiter, resetPasswordHandler);
router.post('/login', authLimiter, validateBody(dashboardLoginSchema), dashboardLoginHandler);
router.post('/refresh', validateBody(refreshSchema), refreshHandler);
router.post('/demo-login', authLimiter, demoLoginHandler);
router.get('/me', authenticate, meHandler);

export default router;