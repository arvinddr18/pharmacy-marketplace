import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resolvePharmacy } from '../middleware/tenant.js';
import { validateBody } from '../validators/auth.validators.js';
import {
  createListingSchema,
  updateListingSchema,
  createBatchSchema,
  adjustBatchSchema,
} from '../validators/catalogue.validators.js';
import { ROLES } from '../config/constants.js';
import {
  getMyPharmacy,
  listMyPharmacyOrders,
  getPharmacyByIdScoped,
} from '../controllers/pharmacy.controller.js';
import {
  listListings,
  createListing,
  updateListing,
  deleteListing,
  listBatches,
  createBatch,
  adjustBatch,
} from '../controllers/inventory.controller.js';
import { acceptOrder, markReady, rejectOrder } from '../controllers/pharmacy.order.controller.js';

const router = Router();

router.use(authenticate, requireRole(ROLES.PHARMACY_OWNER, ROLES.PHARMACY_STAFF), resolvePharmacy);

router.get('/me', getMyPharmacy);
router.get('/orders', listMyPharmacyOrders);
router.post('/orders/:id/accept', acceptOrder);
router.post('/orders/:id/ready', markReady);
router.post('/orders/:id/reject', rejectOrder);

// --- Inventory: listings + batches (all tenant-scoped to req.pharmacyId) ---
router.get('/listings', listListings);
router.post('/listings', validateBody(createListingSchema), createListing);
router.patch('/listings/:id', validateBody(updateListingSchema), updateListing);
router.delete('/listings/:id', deleteListing);

router.get('/listings/:id/batches', listBatches);
router.post('/listings/:id/batches', validateBody(createBatchSchema), createBatch);
router.patch('/batches/:id/adjust', validateBody(adjustBatchSchema), adjustBatch);

// NOTE: keep this LAST — it's a catch-all /:id and would shadow routes above.
router.get('/:id', getPharmacyByIdScoped);

export default router;