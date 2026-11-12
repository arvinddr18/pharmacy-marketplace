# PROJECT STATUS

_Last updated: 2026-11-05_

## Current phase: Phase 1 — Backend foundation ✅ (core done)

### Done
- Monorepo + backend structure (`backend/src/{config,models,controllers,routes,middleware,services,validators,utils}`)
- Config: env loader, Mongo connection, shared constants/enums
- Models: `User`, `Pharmacy`, `PharmacyMembership`, `OtpToken`
- Auth: OTP request/verify (dev console OTP), email+password dashboard login, JWT access+refresh, `/me`
- **Tenant isolation middleware** (`resolvePharmacy`, `ensureSameTenant`) — pharmacy resolved from DB membership, never from client input
- Role-based access (`requireRole`)
- Security baseline: helmet, CORS allowlist, rate limiting, zod validation, central error handler
- Seed script for dev test accounts + two pharmacies
- Isolation test: **10/10 checks pass** (incl. cross-tenant denial = acceptance WORKFLOW 16)

### Verified in sandbox
- All modules import cleanly, no mongoose index warnings
- Real Express app passes auth + isolation tests
- `npm audit`: 0 vulnerabilities

### Not yet started
- Remaining DB models (MedicineCatalogue, PharmacyMedicineListing, InventoryBatch, Order, OrderItem, Prescription, Rider, RiderAssignment, DeliveryTracking, Payment, Refund, Settlement, SubscriptionPlan, PharmacySubscription, Invoice, Notification, Address, Review, SupportTicket, ServiceArea, AuditLog, PlatformSettings, PromotionalCampaign)
- Admin pharmacy approval endpoints
- Pharmacy onboarding/registration endpoint
- Frontend apps (all four)
- Orders engine, payments, delivery, real-time (Socket.IO), notifications
- Deployment config

## Next task (resume here)
**Phase 2a — Pharmacy onboarding + admin approval.**
1. `POST /api/pharmacy/register` (public) — create Pharmacy (status=pending) + owner User + membership
2. Admin routes: list pending, approve, reject, suspend (requireRole admin/super_admin)
3. Medicine catalogue model + admin CRUD
4. Pharmacy medicine listing + inventory batch models (tenant-scoped)
Write tests for each before moving on.

## Known sandbox limitation
MongoDB binary download is blocked by the sandbox proxy, so the server can't be
booted against a live DB here. It runs normally on your machine with local
MongoDB or Atlas. Isolation logic is proven via in-memory model stubs.
