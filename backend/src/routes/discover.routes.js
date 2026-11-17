import { Router } from 'express';
import {
  searchMedicines,
  medicineOffers,
  listPharmacies,
  pharmacyProducts,
  scanMedicines,
} from '../controllers/discover.controller.js';

const router = Router();

// Public — no authentication needed to browse the marketplace.
router.get('/medicines', searchMedicines);
router.post('/scan', scanMedicines);
router.get('/medicines/:id/offers', medicineOffers);
router.get('/pharmacies', listPharmacies);
router.get('/pharmacies/:id/products', pharmacyProducts);

export default router;