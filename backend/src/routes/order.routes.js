import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import {
  createOrder, myOrders, getMyOrder, cancelMyOrder,
  listAddresses, addAddress, deleteAddress, addReview, validateCoupon,
} from '../controllers/order.controller.js';

const router = Router();

// Customer-only order endpoints.
router.use(authenticate, requireRole(ROLES.CUSTOMER));

router.post('/orders', createOrder);
router.get('/orders', myOrders);
router.get('/orders/:id', getMyOrder);
router.post('/orders/:id/cancel', cancelMyOrder);
router.post('/orders/:id/review', addReview);
router.post('/coupons/validate', validateCoupon);

router.get('/addresses', listAddresses);
router.post('/addresses', addAddress);
router.delete('/addresses/:id', deleteAddress);

export default router;