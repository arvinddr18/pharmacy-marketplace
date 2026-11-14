import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import { createOrder, myOrders, getMyOrder, cancelMyOrder } from '../controllers/order.controller.js';

const router = Router();

router.use(authenticate, requireRole(ROLES.CUSTOMER));

router.post('/orders', createOrder);
router.get('/orders', myOrders);
router.get('/orders/:id', getMyOrder);
router.post('/orders/:id/cancel', cancelMyOrder);

export default router;