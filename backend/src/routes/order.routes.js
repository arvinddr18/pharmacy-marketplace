import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import {
  createOrder, deliveryQuote, myOrders, getMyOrder, cancelMyOrder,
  listAddresses, addAddress, deleteAddress, addReview, validateCoupon,
  createPrescriptionOrder,
  listSavedSearches, addSavedSearch, deleteSavedSearch,
  updateProfile, changePassword, deactivateAccount, deleteAccount,
  listSessions, revokeOtherSessions, revokeSession,
  send2faSetupCode, enable2fa, disable2fa,
} from '../controllers/order.controller.js';
import { createRazorpayOrder, verifyPayment } from '../controllers/payment.controller.js';
import { createReminder, listReminders, snoozeReminder, deleteReminder } from '../controllers/reminder.controller.js';

const router = Router();

// Customer-only order endpoints.
router.use(authenticate, requireRole(ROLES.CUSTOMER));

router.post('/orders', createOrder);
router.post('/delivery-quote', deliveryQuote);
router.post('/prescription-orders', createPrescriptionOrder);
router.get('/orders', myOrders);
router.get('/orders/:id', getMyOrder);
router.post('/orders/:id/cancel', cancelMyOrder);
router.post('/orders/:id/review', addReview);
router.post('/coupons/validate', validateCoupon);
router.post('/payments/create', createRazorpayOrder);
router.post('/payments/verify', verifyPayment);

router.get('/saved-searches', listSavedSearches);
router.post('/saved-searches', addSavedSearch);
router.delete('/saved-searches/:q', deleteSavedSearch);

router.get('/reminders', listReminders);
router.post('/reminders', createReminder);
router.post('/reminders/:id/snooze', snoozeReminder);
router.delete('/reminders/:id', deleteReminder);

router.get('/addresses', listAddresses);
router.post('/addresses', addAddress);
router.delete('/addresses/:id', deleteAddress);

router.patch('/profile', updateProfile);
router.patch('/password', changePassword);
router.get('/sessions', listSessions);
router.delete('/sessions/others', revokeOtherSessions);
router.delete('/sessions/:id', revokeSession);
router.post('/account/deactivate', deactivateAccount);
router.delete('/account', deleteAccount);

router.post('/2fa/send-code', send2faSetupCode);
router.post('/2fa/enable', enable2fa);
router.post('/2fa/disable', disable2fa);

export default router;