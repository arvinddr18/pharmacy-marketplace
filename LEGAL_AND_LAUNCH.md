# LEGAL & LAUNCH READINESS

**This is not legal advice.** It is a checklist of things that must be cleared by
a qualified Indian regulatory lawyer and pharmacy professional **before** this
platform takes real medicine orders from the public.

## Why live ordering is gated in code
The backend ships with `FEATURE_LIVE_ORDERS=false`. The order engine (built in a
later phase) must refuse to accept real orders while this flag is off. Do not
turn it on until the items below are cleared in writing.

## Must be reviewed before launch
- **Drugs and Cosmetics Act, 1940 & Rules, 1945** — sale/distribution of drugs.
- **CDSCO** notifications on online/e-pharmacy activity.
- **State drug control (Karnataka)** licensing for each participating shop and
  for the platform's role.
- **G.S.R. 220(E)** doorstep-delivery conditions.
- **Schedule H / H1 / X** prescription-medicine handling: who verifies the
  prescription, who dispenses, record retention. The platform must NOT dispense.
- **Pharmacist responsibility** — a registered pharmacist at the shop performs
  verification and dispensing; the software only coordinates.
- **Who collects money for medicines** and how pharmacies are settled — payment
  aggregator rules (RBI) and whether the platform may collect at all.
- **GST** and company registration for the platform and settlements.
- **DPDP Act, 2023** — handling of customer data and prescription images
  (private storage, consent, retention, deletion).
- **Consumer protection** and grievance handling.

## Platform must not
- Represent itself as a licensed pharmacy unless it actually holds the licence.
- Recommend medicines, dosages, or substitutions.
- Auto-substitute medicines.
- Enable any restricted medicine category until that exact workflow is cleared.

## Accounts/services you must create (none can be done for you)
- MongoDB Atlas, backend host (Render/Railway/etc.), domain + HTTPS.
- Payment gateway (e.g. Razorpay) with your company KYC — sandbox first.
- SMS/OTP provider (e.g. MSG91) with sender/DLT registration.
- Firebase (FCM) project; Google Maps Platform key.
- Private object storage for prescriptions (signed, time-limited access).
- Google Play Console developer account for the two Android apps.
