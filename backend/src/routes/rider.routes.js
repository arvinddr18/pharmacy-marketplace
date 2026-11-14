import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import { myDeliveries, confirmPickup, confirmDelivery } from '../controllers/rider.controller.js';

const router = Router();

router.use(authenticate, requireRole(ROLES.RIDER));

router.get('/orders', myDeliveries);
router.post('/orders/:id/pickup', confirmPickup);
router.post('/orders/:id/deliver', confirmDelivery);

export default router;