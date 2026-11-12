# IMPLEMENTATION CHECKLIST

Legend: [x] done · [~] partial · [ ] not started

## Phase 1 — Foundation
- [x] Monorepo + backend scaffolding
- [x] Env config + Mongo connection
- [x] User / Pharmacy / PharmacyMembership / OtpToken models
- [x] OTP auth (dev console)
- [x] Dashboard password auth + JWT refresh
- [x] Role-based access control
- [x] Server-side tenant isolation
- [x] Security baseline (helmet, cors, rate limit, validation, error handler)
- [x] Seed + isolation test

## Phase 2 — Pharmacy & catalogue
- [ ] Pharmacy registration endpoint
- [ ] Admin approve / reject / suspend
- [ ] MedicineCatalogue model + admin CRUD
- [ ] PharmacyMedicineListing (tenant-scoped)
- [ ] InventoryBatch (expiry/stock, prevent oversell, block expired)
- [ ] Pharmacy dashboard (React) shell + auth + these screens

## Phase 3 — Orders & delivery
- [ ] Order / OrderItem / Prescription models
- [ ] Order state machine (server-enforced transitions)
- [ ] Stock reservation with transactions
- [ ] Rider / RiderAssignment / DeliveryTracking
- [ ] Delivery OTP

## Phase 4 — Money
- [ ] SubscriptionPlan / PharmacySubscription / Invoice (completed-order counting)
- [ ] Payment / Refund / Settlement (gateway sandbox, webhook verify, server-side truth)
- [ ] Financial ledger + reconciliation

## Phase 5 — Real-time & apps
- [ ] Socket.IO authed rooms (customer/pharmacy/rider/admin)
- [ ] FCM push
- [ ] Customer app (Expo)
- [ ] Rider app (Expo)
- [ ] Admin dashboard (React)

## Phase 6 — Launch readiness
- [ ] Automated test suite + CI
- [ ] Deployment (backend host, Atlas, Vercel dashboards)
- [ ] Android builds + Play Console
- [ ] **Legal/pharmacy clearance obtained** (gates live orders)
