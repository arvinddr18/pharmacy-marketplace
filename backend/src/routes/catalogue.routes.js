import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody } from '../validators/auth.validators.js';
import { createCatalogueSchema, updateCatalogueSchema } from '../validators/catalogue.validators.js';
import { ROLES } from '../config/constants.js';
import {
  searchCatalogue,
  getCatalogueItem,
  createCatalogueItem,
  bulkCreateCatalogue,
  bulkSetRx,
  bulkSetCategory,
  updateCatalogueItem,
  approveCatalogueItem,
  deleteCatalogueItem,
} from '../controllers/catalogue.controller.js';

const router = Router();

const adminOnly = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.get('/', authenticate, searchCatalogue);
router.get('/:id', authenticate, getCatalogueItem);

router.post('/', authenticate, adminOnly, validateBody(createCatalogueSchema), createCatalogueItem);
router.post('/bulk', authenticate, adminOnly, bulkCreateCatalogue);
router.post('/bulk-rx', authenticate, adminOnly, bulkSetRx);
router.post('/bulk-category', authenticate, adminOnly, bulkSetCategory);
router.patch('/:id', authenticate, adminOnly, validateBody(updateCatalogueSchema), updateCatalogueItem);
router.post('/:id/approve', authenticate, adminOnly, approveCatalogueItem);
router.delete('/:id', authenticate, adminOnly, deleteCatalogueItem);

export default router;