import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody } from '../validators/auth.validators.js';
import { rejectPharmacySchema, suspendPharmacySchema } from '../validators/pharmacy.validators.js';
import { ROLES } from '../config/constants.js';
import {
  listPharmacies,
  getPharmacy,
  approvePharmacy,
  rejectPharmacy,
  suspendPharmacy,
  reactivatePharmacy,
} from '../controllers/admin.pharmacy.controller.js';
import { listAllOrders, markDelivered, getOrderPrescriptionAdmin, assignPharmacyToOrder, findPharmaciesWithMedicine } from '../controllers/admin.orders.controller.js';
import { listRiders, createRider, assignRider, approveRider, suspendRider } from '../controllers/admin.riders.controller.js';
import { listCoupons, createCoupon, toggleCoupon, deleteCoupon } from '../controllers/admin.coupons.controller.js';

const router = Router();

router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN));

router.get('/pharmacies', listPharmacies);
router.get('/pharmacies/:id', getPharmacy);
router.post('/pharmacies/:id/approve', approvePharmacy);
router.post('/pharmacies/:id/reject', validateBody(rejectPharmacySchema), rejectPharmacy);
router.post('/pharmacies/:id/suspend', validateBody(suspendPharmacySchema), suspendPharmacy);
router.post('/pharmacies/:id/reactivate', reactivatePharmacy);
router.get('/orders', listAllOrders);
router.post('/orders/:id/delivered', markDelivered);
router.get('/orders/:id/prescription', getOrderPrescriptionAdmin);
router.post('/orders/:id/assign-pharmacy', assignPharmacyToOrder);
router.get('/pharmacies-with-medicine', findPharmaciesWithMedicine);
router.get('/riders', listRiders);
router.post('/riders', createRider);
router.post('/riders/:id/approve', approveRider);
router.post('/riders/:id/suspend', suspendRider);
router.post('/orders/:id/assign', assignRider);

router.get('/coupons', listCoupons);
router.post('/coupons', createCoupon);
router.post('/coupons/:id/toggle', toggleCoupon);
router.delete('/coupons/:id', deleteCoupon);

export default router;