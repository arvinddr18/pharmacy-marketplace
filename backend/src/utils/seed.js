import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Pharmacy } from '../models/Pharmacy.js';
import { PharmacyMembership } from '../models/PharmacyMembership.js';
import { MedicineCatalogue } from '../models/MedicineCatalogue.js';
import { PharmacyMedicineListing } from '../models/PharmacyMedicineListing.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ROLES, PHARMACY_STATUS } from '../config/constants.js';

async function seed() {
  if (env.nodeEnv === 'production') {
    console.error('[seed] refusing to run with NODE_ENV=production.');
    process.exit(1);
  }

  await connectDB();

  const dbName = mongoose.connection.name ?? '';
  if (!/pharmacy/i.test(dbName)) {
    console.error(
      `[seed] refusing to run: database "${dbName}" does not look like the pharmacy database.\n` +
      '       The seed deletes collections. Point MONGODB_URI at a database whose\n' +
      '       name contains "pharmacy" (e.g. .../pharmacy_marketplace) and try again.'
    );
    await disconnectDB();
    process.exit(1);
  }

  console.log(`[seed] target database: ${dbName}`);
  console.log('[seed] clearing dev collections...');
  await Promise.all([
    User.deleteMany({}), Pharmacy.deleteMany({}), PharmacyMembership.deleteMany({}),
    MedicineCatalogue.deleteMany({}), PharmacyMedicineListing.deleteMany({}), InventoryBatch.deleteMany({}),
  ]);

  // --- Platform admin ---
  const admin = new User({ name: 'Platform Admin', email: 'admin@pharmacy.test', role: ROLES.SUPER_ADMIN, emailVerified: true });
  await admin.setPassword('Admin@12345');
  await admin.save();

  // --- Pharmacy A + owner ---
  const pharmacyA = await Pharmacy.create({
    name: 'ABC Medicals', ownerName: 'Shop A', status: PHARMACY_STATUS.APPROVED,
    approvedAt: new Date(), approvedBy: admin._id,
    address: { line1: 'Main Road', city: 'Tarikere', pincode: '577228', state: 'Karnataka' },
    location: { type: 'Point', coordinates: [75.814, 13.712] },
  });
  const ownerA = new User({ name: 'ABC Owner', email: 'owner.a@pharmacy.test', role: ROLES.PHARMACY_OWNER, emailVerified: true });
  await ownerA.setPassword('Owner@12345');
  await ownerA.save();
  await PharmacyMembership.create({ user: ownerA._id, pharmacy: pharmacyA._id, role: ROLES.PHARMACY_OWNER });

  // --- Pharmacy B + owner ---
  const pharmacyB = await Pharmacy.create({
    name: 'Health Plus Medicals', ownerName: 'Shop B', status: PHARMACY_STATUS.APPROVED,
    approvedAt: new Date(), approvedBy: admin._id,
    address: { line1: 'Market Street', city: 'Tarikere', pincode: '577228', state: 'Karnataka' },
    location: { type: 'Point', coordinates: [75.818, 13.715] },
  });
  const ownerB = new User({ name: 'Health Plus Owner', email: 'owner.b@pharmacy.test', role: ROLES.PHARMACY_OWNER, emailVerified: true });
  await ownerB.setPassword('Owner@12345');
  await ownerB.save();
  await PharmacyMembership.create({ user: ownerB._id, pharmacy: pharmacyB._id, role: ROLES.PHARMACY_OWNER });

  // --- Customers ---
  await User.create({ name: 'Customer One', phone: '9000000001', role: ROLES.CUSTOMER, phoneVerified: true });
  await User.create({ name: 'Customer Two', phone: '9000000002', role: ROLES.CUSTOMER, phoneVerified: true });

  // --- Central medicine catalogue (sample) ---
  const [para, amox, cetz] = await MedicineCatalogue.create([
    { name: 'Paracetamol 500 mg', brand: 'Calpol', genericName: 'Paracetamol', manufacturer: 'GSK',
      strength: '500 mg', dosageForm: 'tablet', packSize: '15 tablets', prescriptionRequired: false, status: 'active' },
    { name: 'Amoxicillin 500 mg', brand: 'Mox', genericName: 'Amoxicillin', manufacturer: 'Sun Pharma',
      strength: '500 mg', dosageForm: 'capsule', packSize: '10 capsules', prescriptionRequired: true, scheduleCategory: 'H', status: 'active' },
    { name: 'Cetirizine 10 mg', brand: 'Cetzine', genericName: 'Cetirizine', manufacturer: 'Dr. Reddy',
      strength: '10 mg', dosageForm: 'tablet', packSize: '10 tablets', prescriptionRequired: false, status: 'active' },
  ]);

  // --- Pharmacy A lists Paracetamol + Amoxicillin, with one stock batch each ---
  const inOneYear = new Date(Date.now() + 365 * 864e5);
  const listA1 = await PharmacyMedicineListing.create({ pharmacy: pharmacyA._id, medicine: para._id, mrp: 30, sellingPrice: 27, prescriptionRequired: false });
  await InventoryBatch.create({ pharmacy: pharmacyA._id, listing: listA1._id, medicine: para._id, batchNumber: 'PARA-A-001', expiryDate: inOneYear, quantity: 120 });

  const listA2 = await PharmacyMedicineListing.create({ pharmacy: pharmacyA._id, medicine: amox._id, mrp: 95, sellingPrice: 90, prescriptionRequired: true });
  await InventoryBatch.create({ pharmacy: pharmacyA._id, listing: listA2._id, medicine: amox._id, batchNumber: 'AMOX-A-001', expiryDate: inOneYear, quantity: 40 });

  // --- Pharmacy B lists Cetirizine (its own independent inventory) ---
  const listB1 = await PharmacyMedicineListing.create({ pharmacy: pharmacyB._id, medicine: cetz._id, mrp: 25, sellingPrice: 22, prescriptionRequired: false });
  await InventoryBatch.create({ pharmacy: pharmacyB._id, listing: listB1._id, medicine: cetz._id, batchNumber: 'CETZ-B-001', expiryDate: inOneYear, quantity: 80 });

  console.log('\n[seed] done. Test accounts:');
  console.table([
    { who: 'Super Admin', login: 'admin@pharmacy.test', password: 'Admin@12345' },
    { who: 'Pharmacy A owner', login: 'owner.a@pharmacy.test', password: 'Owner@12345' },
    { who: 'Pharmacy B owner', login: 'owner.b@pharmacy.test', password: 'Owner@12345' },
    { who: 'Customer One', login: 'phone 9000000001', password: 'OTP (see server log)' },
    { who: 'Customer Two', login: 'phone 9000000002', password: 'OTP (see server log)' },
  ]);
  console.log(`\nPharmacy A id: ${pharmacyA._id}`);
  console.log(`Pharmacy B id: ${pharmacyB._id}`);

  await disconnectDB();
  process.exit(0);
}

seed().catch((err) => { console.error('[seed] failed:', err); process.exit(1); });