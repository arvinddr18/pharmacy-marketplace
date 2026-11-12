# Pharmacy Marketplace — Multi-Vendor Medicine Ordering & Delivery

A multi-tenant platform connecting licensed medical shops with customers, with
its own delivery network and a central admin. Monorepo: one backend, one
database, four frontends (customer app, pharmacy dashboard, rider app, admin
dashboard).

> **Status:** early development. The **backend foundation (Phase 1)** is built
> and tested: project structure, config, database models for identity + tenants,
> OTP + password auth, and **server-enforced pharmacy tenant isolation**.
> The four frontend apps, orders, payments, delivery and real-time are not yet
> built. **Live medicine ordering is disabled** and must stay disabled until the
> operating model has Indian legal/pharmacy clearance (see LEGAL_AND_LAUNCH.md).

## What works right now

- `GET /health` — service + feature-flag status
- `POST /api/auth/otp/request` / `POST /api/auth/otp/verify` — customer OTP login (dev: OTP printed to server console)
- `POST /api/auth/login` — email+password login for pharmacy/admin dashboards
- `POST /api/auth/refresh`, `GET /api/auth/me`
- `GET /api/pharmacy/me`, `/api/pharmacy/orders`, `/api/pharmacy/:id` — tenant-scoped, isolation enforced server-side

## Requirements

- Node.js 18+ (built on Node 22)
- MongoDB running locally, **or** a MongoDB Atlas connection string

## Run the backend locally

```bash
cd backend
cp .env.example .env          # then edit .env (set MONGODB_URI, JWT secrets)
npm install
npm run seed                  # creates dev test accounts + two pharmacies
npm run dev                   # starts on http://localhost:5000
```

Check it:

```bash
curl http://localhost:5000/health
```

## Test accounts (after `npm run seed`)

| Who | Login | Password |
|-----|-------|----------|
| Super Admin | admin@pharmacy.test | Admin@12345 |
| Pharmacy A owner | owner.a@pharmacy.test | Owner@12345 |
| Pharmacy B owner | owner.b@pharmacy.test | Owner@12345 |
| Customer One | phone 9000000001 | OTP in server log |
| Customer Two | phone 9000000002 | OTP in server log |

## Run the isolation test

Proves Pharmacy A cannot read Pharmacy B's data (no MongoDB needed — uses
in-memory model stubs against the real app):

```bash
cd backend
JWT_ACCESS_SECRET=x JWT_REFRESH_SECRET=y node tests/isolation.test.mjs
```

## Repo layout

```
pharmacy-marketplace/
  backend/            Node + Express + Mongoose API (built)
  apps/               customer-app, rider-app, pharmacy-dashboard, admin-dashboard (not yet created)
  PROJECT_STATUS.md   what's done / in progress / next
  IMPLEMENTATION_CHECKLIST.md
  CHANGELOG.md
  LEGAL_AND_LAUNCH.md readiness + compliance gating
```

See **PROJECT_STATUS.md** for the current phase and the exact next task.
