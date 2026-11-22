import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  updateProfile,
  listSessions, revokeOtherSessions, revokeSession,
  send2faSetupCode, enable2fa, disable2fa,
} from '../controllers/order.controller.js';

const router = Router();

// Account self-service available to ANY signed-in user
// (customer, pharmacy owner/staff, admin, rider). The controller functions
// act on req.user / req.sid, so they are already role-agnostic.
router.use(authenticate);

router.patch('/profile', updateProfile);
router.get('/sessions', listSessions);
router.delete('/sessions/others', revokeOtherSessions);
router.delete('/sessions/:id', revokeSession);
router.post('/2fa/send-code', send2faSetupCode);
router.post('/2fa/enable', enable2fa);
router.post('/2fa/disable', disable2fa);

export default router;