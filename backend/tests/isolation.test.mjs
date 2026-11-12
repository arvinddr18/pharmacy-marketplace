/**
 * Proves auth + tenant isolation WITHOUT a running MongoDB, by replacing the
 * three models' query methods with an in-memory fake. The middleware,
 * controllers, token service and routes under test are the REAL ones.
 *
 * Run: node test-isolation.mjs
 */
import assert from 'node:assert';
import request from 'supertest';

// --- in-memory fixtures ---
import { ROLES, PHARMACY_STATUS, ACCOUNT_STATUS } from '../src/config/constants.js';

const pharmacies = {
  A: { _id: 'phA', name: 'ABC Medicals', status: PHARMACY_STATUS.APPROVED, deletedAt: null },
  B: { _id: 'phB', name: 'Health Plus Medicals', status: PHARMACY_STATUS.APPROVED, deletedAt: null },
};
const users = {
  ownerA: { _id: 'uA', name: 'ABC Owner', role: ROLES.PHARMACY_OWNER, status: ACCOUNT_STATUS.ACTIVE, deletedAt: null },
  ownerB: { _id: 'uB', name: 'HP Owner', role: ROLES.PHARMACY_OWNER, status: ACCOUNT_STATUS.ACTIVE, deletedAt: null },
};
const memberships = [
  { _id: 'mA', user: 'uA', pharmacy: 'phA', role: ROLES.PHARMACY_OWNER, active: true },
  { _id: 'mB', user: 'uB', pharmacy: 'phB', role: ROLES.PHARMACY_OWNER, active: true },
];

// attach toSafeJSON like the real model
for (const u of Object.values(users)) u.toSafeJSON = function () { const { toSafeJSON, ...rest } = this; return rest; };

// --- stub the models the middleware/controllers import ---
import { User } from '../src/models/User.js';
import { Pharmacy } from '../src/models/Pharmacy.js';
import { PharmacyMembership } from '../src/models/PharmacyMembership.js';

User.findById = async (id) => Object.values(users).find((u) => u._id === String(id)) ?? null;
Pharmacy.findById = async (id) => Object.values(pharmacies).find((p) => p._id === String(id)) ?? null;
PharmacyMembership.findOne = async (q) => memberships.find((m) => m.user === String(q.user) && m.active) ?? null;

// --- build the real app ---
const { createApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/services/token.service.js');
const app = createApp();

const tokenA = signAccessToken(users.ownerA);
const tokenB = signAccessToken(users.ownerB);

let passed = 0;
const check = (name, cond) => { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; };

console.log('\nTENANT ISOLATION + AUTH TESTS\n');

// 1. health
let r = await request(app).get('/health');
check('health endpoint returns ok', r.status === 200 && r.body.status === 'ok');
check('live orders flag is OFF by default', r.body.liveOrders === false);

// 2. unauthenticated is rejected
r = await request(app).get('/api/pharmacy/me');
check('no token -> 401', r.status === 401);

// 3. owner A sees ONLY pharmacy A
r = await request(app).get('/api/pharmacy/me').set('Authorization', `Bearer ${tokenA}`);
check('owner A resolves to pharmacy A', r.status === 200 && r.body.pharmacy._id === 'phA');

// 4. owner B sees ONLY pharmacy B
r = await request(app).get('/api/pharmacy/me').set('Authorization', `Bearer ${tokenB}`);
check('owner B resolves to pharmacy B', r.status === 200 && r.body.pharmacy._id === 'phB');

// 5. THE KEY TEST: owner A tries to read pharmacy B by id -> denied (404, no leak)
r = await request(app).get('/api/pharmacy/phB').set('Authorization', `Bearer ${tokenA}`);
check('owner A fetching pharmacy B by id -> 404 (cross-tenant denied)', r.status === 404);
check('  and no pharmacy B data leaked in body', !JSON.stringify(r.body).includes('Health Plus'));

// 6. owner A reading their own by id works
r = await request(app).get('/api/pharmacy/phA').set('Authorization', `Bearer ${tokenA}`);
check('owner A fetching pharmacy A by id -> 200', r.status === 200 && r.body.pharmacy._id === 'phA');

// 7. a customer token cannot reach pharmacy routes (wrong role)
const customer = { _id: 'uC', role: ROLES.CUSTOMER };
const tokenC = signAccessToken(customer);
users.uC = { _id: 'uC', role: ROLES.CUSTOMER, status: ACCOUNT_STATUS.ACTIVE, deletedAt: null };
r = await request(app).get('/api/pharmacy/me').set('Authorization', `Bearer ${tokenC}`);
check('customer role on pharmacy route -> 403', r.status === 403);

// 8. tampered token rejected
r = await request(app).get('/api/pharmacy/me').set('Authorization', 'Bearer not.a.jwt');
check('garbage token -> 401', r.status === 401);

console.log(`\n${passed} checks passed.\n`);
process.exit(0);
