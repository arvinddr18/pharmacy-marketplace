# CHANGELOG

## 2026-11-05 — Phase 1: backend foundation
- Scaffolded monorepo and backend (Express + Mongoose, ES modules).
- Added env/db/constants config.
- Models: User (OTP + password, soft delete), Pharmacy (tenant, geo), PharmacyMembership (tenant link), OtpToken (hashed, TTL).
- Auth: OTP request/verify, dashboard login, JWT access+refresh, /me.
- Middleware: authenticate, requireRole, resolvePharmacy, ensureSameTenant, central error handler.
- Security: helmet, CORS allowlist, rate limiting, zod validation.
- Seed script + isolation test (10/10 passing, including cross-tenant denial).
- Docs: README, PROJECT_STATUS, IMPLEMENTATION_CHECKLIST, LEGAL_AND_LAUNCH.
- Chose zod v4 (clears a high-severity advisory in v3); audit clean.
