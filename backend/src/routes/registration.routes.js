import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registerPharmacy, registerRider } from '../controllers/registration.controller.js';
import { validateBody } from '../validators/auth.validators.js';
import { registerPharmacySchema } from '../validators/pharmacy.validators.js';

const router = Router();

const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.post('/pharmacy', registerLimiter, validateBody(registerPharmacySchema), registerPharmacy);
router.post('/rider', registerLimiter, registerRider);

export default router;