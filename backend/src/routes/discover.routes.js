import { Router } from 'express';
import { searchMedicines, medicineOffers } from '../controllers/discover.controller.js';

const router = Router();

// Public — no authentication needed to browse the marketplace.
router.get('/medicines', searchMedicines);
router.get('/medicines/:id/offers', medicineOffers);

export default router;