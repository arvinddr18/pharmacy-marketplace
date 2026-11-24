import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getVapidKey, subscribePush, unsubscribePush } from '../controllers/push.controller.js';

const router = Router();
router.get('/vapid-key', getVapidKey);
router.post('/subscribe', authenticate, subscribePush);
router.post('/unsubscribe', authenticate, unsubscribePush);
export default router;