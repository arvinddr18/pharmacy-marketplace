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

const router = Router();

router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN));

router.get('/pharmacies', listPharmacies);
router.get('/pharmacies/:id', getPharmacy);
router.post('/pharmacies/:id/approve', approvePharmacy);
router.post('/pharmacies/:id/reject', validateBody(rejectPharmacySchema), rejectPharmacy);
router.post('/pharmacies/:id/suspend', validateBody(suspendPharmacySchema), suspendPharmacy);
router.post('/pharmacies/:id/reactivate', reactivatePharmacy);

export default router;