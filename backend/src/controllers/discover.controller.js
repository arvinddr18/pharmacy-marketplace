import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { Review } from '../models/Review.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { PHARMACY_STATUS } from '../config/constants.js';
import { env } from '../config/env.js';

/** Great-circle distance in km between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * PUBLIC customer-facing discovery. No auth required to browse — customers can
 * search and see offers/shops without logging in (login is only needed to order).
 */

/** GET /api/discover/medicines?q=para — search the central catalogue. */
export const searchMedicines = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const filter = { deletedAt: null, status: 'active' };
  let query;
  if (q && q.trim()) {
    filter.$text = { $search: q.trim() };
    query = MedicineCatalogue.find(filter);
  } else {
    query = MedicineCatalogue.find(filter).sort({ name: 1 });
  }
  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit ?? '60', 10)));
  const [items, total] = await Promise.all([
    query.skip((page - 1) * limit).limit(limit),
    MedicineCatalogue.countDocuments(filter),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

/**
 * POST /api/discover/scan  (public)
 * Reads a photo of tablet strips / a handwritten note with Google Gemini,
 * extracts medicine names, and returns matching catalogue medicines.
 * This is a search HELPER — the customer confirms by tapping a result.
 */
export const scanMedicines = asyncHandler(async (req, res) => {
  if (!env.gemini.apiKey) throw ApiError.badRequest('Photo search is not set up yet');
  const image = typeof req.body.image === 'string' ? req.body.image : '';
  if (!image.startsWith('data:image/')) throw ApiError.badRequest('Please provide a valid image');
  if (image.length > 5_000_000) throw ApiError.badRequest('Image is too large — please use a smaller photo');

  const comma = image.indexOf(',');
  const mimeType = (image.slice(5, comma).split(';')[0]) || 'image/jpeg';
  const base64 = image.slice(comma + 1);

  const prompt = 'This is a photo of medicine strips/packets or a handwritten medicine list. Extract only the distinct medicine or tablet names you can read (brand or generic), and correct any obvious spelling mistakes to the standard medicine name (e.g. "Puracetomol" -> "Paracetamol"). Ignore dosages, company names and other text. Respond with ONLY a JSON array of strings like ["Paracetamol","Amoxicillin"]. If you cannot read any, respond with [].';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' + env.gemini.apiKey;
  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0 },
  });

  let names = [];
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody, signal: AbortSignal.timeout(15000) });
      const data = await resp.json();
      if (!resp.ok) {
        lastErr = data?.error?.message || ('HTTP ' + resp.status);
        // Retry transient overload / rate-limit / server errors.
        if ([429, 500, 503].includes(resp.status) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(lastErr);
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const m = text.match(/\[[\s\S]*\]/);
      names = m ? JSON.parse(m[0]) : [];
      lastErr = '';
      break;
    } catch (e) {
      lastErr = e.message || 'request failed';
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); continue; }
    }
  }
  if (lastErr) throw ApiError.badRequest('The photo reader is busy right now — please try again in a moment.');
  names = (Array.isArray(names) ? names : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 10);

  // Match each detected name against the catalogue.
  const seen = new Set();
  const items = [];
  for (const name of names) {
    const safe = name.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await MedicineCatalogue.find({
      deletedAt: null, status: 'active',
      name: { $regex: safe, $options: 'i' },
    }).limit(5);
    for (const med of found) {
      if (seen.has(String(med._id))) continue;
      seen.add(String(med._id));
      items.push(med);
    }
  }
  res.json({ detected: names, items });
});

/**
 * GET /api/discover/medicines/:id/offers
 * Which approved pharmacies stock this medicine, with price + available stock,
 * cheapest first. Only active listings at approved pharmacies, with
 * non-expired, non-reserved stock counted.
 */
export const medicineOffers = asyncHandler(async (req, res) => {
  const medicine = await MedicineCatalogue.findOne({ _id: req.params.id, deletedAt: null });
  if (!medicine) throw ApiError.notFound('Medicine not found');

  const listings = await PharmacyMedicineListing.find({
    medicine: medicine._id,
    active: true,
    deletedAt: null,
  }).populate('pharmacy', 'name address location status deletedAt');

  const now = new Date();
  const offers = [];
  for (const l of listings) {
    const ph = l.pharmacy;
    if (!ph || ph.deletedAt || ph.status !== PHARMACY_STATUS.APPROVED) continue;

    const batches = await InventoryBatch.find({ listing: l._id, deletedAt: null });
    const available = batches.reduce(
      (sum, b) => sum + (b.expiryDate > now ? Math.max(0, b.quantity - b.reserved) : 0),
      0
    );

    offers.push({
      listingId: l._id,
      pharmacyId: ph._id,
      pharmacyName: ph.name,
      city: ph.address?.city ?? '',
      mrp: l.mrp,
      sellingPrice: l.sellingPrice,
      prescriptionRequired: Boolean(l.prescriptionRequired || medicine.prescriptionRequired),
      available,
      inStock: available > 0,
    });
  }

  const ratings = await Review.ratingsFor(offers.map((o) => o.pharmacyId));
  for (const o of offers) {
    const r = ratings[String(o.pharmacyId)];
    o.rating = r?.avg || 0;
    o.ratingCount = r?.count || 0;
  }

  // Optional location: attach distance / in-area flag and sort nearby first.
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  const location = (req.query.location || '').trim().toLowerCase();
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);

  const listingsById = {};
  for (const l of listings) listingsById[String(l._id)] = l;

  for (const o of offers) {
    o.distanceKm = null; o.inArea = null;
    const ph = listingsById[String(o.listingId)]?.pharmacy;
    if (hasGeo && ph) {
      const co = ph.location && ph.location.coordinates;
      if (co && (co[0] !== 0 || co[1] !== 0)) {
        o.distanceKm = Math.round(haversineKm(lat, lng, co[1], co[0]) * 10) / 10;
        o.inArea = o.distanceKm <= 5;
      } else { o.inArea = false; }
    } else if (location && ph) {
      const a = ph.address || {};
      const hay = [a.line1, a.city, a.district, a.pincode].filter(Boolean).join(' ').toLowerCase();
      o.inArea = hay.includes(location);
    }
  }

  offers.sort((a, b) => {
    if (hasGeo) {
      const da = a.distanceKm == null ? Infinity : a.distanceKm;
      const db = b.distanceKm == null ? Infinity : b.distanceKm;
      if (da !== db) return da - db;
    } else if (location) {
      if (!!b.inArea !== !!a.inArea) return (b.inArea ? 1 : 0) - (a.inArea ? 1 : 0);
    }
    return a.sellingPrice - b.sellingPrice;
  });

  res.json({ medicine, offers });
});

/**
 * GET /api/discover/pharmacies?q=abc
 * PUBLIC — list approved, active medical shops for the customer home page.
 * Optional name search. Returns light shop cards (no stock counts).
 */
export const listPharmacies = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const location = (req.query.location || '').trim();

  const base = { status: PHARMACY_STATUS.APPROVED, deletedAt: null };
  if (q && q.trim()) base.name = { $regex: q.trim(), $options: 'i' };

  let items;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // Nearest-first using the 2dsphere index, with distance attached.
    const found = await Pharmacy.aggregate([
      { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distanceMeters', spherical: true, query: base } },
      { $limit: 60 },
      { $project: { name: 1, address: 1, operatingHours: 1, logoUrl: 1, location: 1, distanceMeters: 1 } },
    ]);
    const ratings = await Review.ratingsFor(found.map((p) => p._id));
    items = found.map((p) => {
      const co = (p.location && p.location.coordinates) || [0, 0];
      const set = co[0] !== 0 || co[1] !== 0;
      const r = ratings[String(p._id)];
      return { ...p, rating: r?.avg || 0, ratingCount: r?.count || 0, distanceKm: set ? Math.round(p.distanceMeters / 100) / 10 : null };
    });
  } else {
    const filter = { ...base };
    if (location) {
      const safe = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = { $regex: safe, $options: 'i' };
      filter.$or = [{ 'address.city': rx }, { 'address.pincode': rx }, { 'address.line1': rx }, { 'address.district': rx }];
    }
    const found = await Pharmacy.find(filter).sort({ name: 1 }).limit(60).select('name address operatingHours logoUrl').lean();
    const ratings = await Review.ratingsFor(found.map((p) => p._id));
    items = found.map((p) => {
      const r = ratings[String(p._id)];
      return { ...p, rating: r?.avg || 0, ratingCount: r?.count || 0 };
    });
  }

  res.json({ items });
});

/**
 * GET /api/discover/pharmacies/:id/products?q=para
 * PUBLIC — one approved shop plus its sellable products (active listings whose
 * catalogue entry is active), with price, MRP, Rx flag and available stock.
 * Optional name filter within the shop.
 */
export const pharmacyProducts = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({
    _id: req.params.id,
    status: PHARMACY_STATUS.APPROVED,
    deletedAt: null,
  }).select('name address operatingHours logoUrl phone').lean();
  if (!pharmacy) throw ApiError.notFound('Pharmacy not found');

  // Rating summary + recent reviews for this shop.
  const ratingMap = await Review.ratingsFor([pharmacy._id]);
  const rs = ratingMap[String(pharmacy._id)];
  pharmacy.rating = rs?.avg || 0;
  pharmacy.ratingCount = rs?.count || 0;
  const reviews = await Review.find({ pharmacy: pharmacy._id })
    .sort({ createdAt: -1 }).limit(10).select('customerName rating comment createdAt').lean();

  const q = (req.query.q || '').trim().toLowerCase();

  const listings = await PharmacyMedicineListing.find({
    pharmacy: pharmacy._id,
    active: true,
    deletedAt: null,
  }).populate('medicine', 'name brand strength dosageForm packSize prescriptionRequired status deletedAt imageUrl');

  const now = new Date();
  const products = [];
  for (const l of listings) {
    const med = l.medicine;
    if (!med || med.deletedAt || med.status !== 'active') continue;
    if (q && !med.name.toLowerCase().includes(q)) continue;

    const batches = await InventoryBatch.find({ listing: l._id, deletedAt: null });
    const available = batches.reduce(
      (sum, b) => sum + (b.expiryDate > now ? Math.max(0, b.quantity - b.reserved) : 0),
      0
    );

    products.push({
      listingId: l._id,
      medicineId: med._id,
      name: med.name,
      brand: med.brand || '',
      strength: med.strength || '',
      dosageForm: med.dosageForm || '',
      packSize: med.packSize || '',
      imageUrl: med.imageUrl || '',
      mrp: l.mrp,
      sellingPrice: l.sellingPrice,
      prescriptionRequired: Boolean(l.prescriptionRequired || med.prescriptionRequired),
      available,
      inStock: available > 0,
    });
  }

  products.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ pharmacy, products, reviews });
});