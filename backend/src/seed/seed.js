import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import { env } from '../config/env.js';
import { ensureDefaultTenant, getTenantBySlug } from '../services/tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { LabTest } from '../models/LabTest.js';
import { RadiologyTest } from '../models/RadiologyTest.js';
import { Medicine } from '../models/Medicine.js';
import { MedicineBatch } from '../models/MedicineBatch.js';
import { Vendor } from '../models/Vendor.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { Ward } from '../models/Ward.js';
import { Room } from '../models/Room.js';
import { Bed } from '../models/Bed.js';
import { Appointment } from '../models/Appointment.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { Invoice } from '../models/Invoice.js';
import { ROLE_DEFINITIONS, ROLES } from '../config/roles.js';

// `--fresh` wipes demo collections first so the seed is fully reproducible.
// Without it the seed is idempotent (upsert by unique keys) and never
// overwrites existing passwords.
const FRESH = process.argv.includes('--fresh');

const DEPARTMENTS = [
  { name: 'Cardiology', code: 'CARD' },
  { name: 'General Medicine', code: 'GMED' },
  { name: 'Orthopedics', code: 'ORTHO' },
  { name: 'Radiology', code: 'RADIO' },
  { name: 'Pathology', code: 'PATH' },
  { name: 'Emergency', code: 'EMER' },
  { name: 'Pediatrics', code: 'PEDIA' },
  { name: 'Gynecology', code: 'GYNE' },
];

// Demo staff — one login per role so every screen can be explored.
// Password for every demo account: <Role>@123 (e.g. Doctor@123).
const STAFF = [
  { name: 'Dr. Ravi Sharma', email: 'ravi@hms.local', role: ROLES.DOCTOR, password: 'Doctor@123', dept: 'CARD' },
  { name: 'Dr. Meena Iyer', email: 'meena@hms.local', role: ROLES.DOCTOR, password: 'Doctor@123', dept: 'GMED' },
  { name: 'Nurse Anita Das', email: 'anita@hms.local', role: ROLES.NURSE, password: 'Nurse@123', dept: 'GMED' },
  { name: 'Rahul Verma', email: 'rahul@hms.local', role: ROLES.RECEPTIONIST, password: 'Reception@123' },
  { name: 'Lab Tech Suresh', email: 'suresh@hms.local', role: ROLES.LAB_TECHNICIAN, password: 'Lab@123', dept: 'PATH' },
  { name: 'Radiologist Priya', email: 'priya@hms.local', role: ROLES.RADIOLOGIST, password: 'Radio@123', dept: 'RADIO' },
  { name: 'Pharmacist Vijay', email: 'vijay@hms.local', role: ROLES.PHARMACIST, password: 'Pharma@123' },
  { name: 'Accountant Neha', email: 'neha@hms.local', role: ROLES.ACCOUNTANT, password: 'Account@123' },
  { name: 'Store Mgr Kiran', email: 'kiran@hms.local', role: ROLES.STORE_MANAGER, password: 'Store@123' },
  { name: 'OT Staff Deepak', email: 'deepak@hms.local', role: ROLES.OT_STAFF, password: 'OT@123' },
  { name: 'HR Manager Sonia', email: 'sonia@hms.local', role: ROLES.HR, password: 'HR@123' },
];

// Doctors (clinical profiles). `userEmail` links to a login above when present.
const DOCTORS = [
  { firstName: 'Ravi', lastName: 'Sharma', registrationNo: 'MH-CARD-1001', specialization: 'Cardiologist', dept: 'CARD', qualification: 'MBBS, MD, DM (Cardiology)', experienceYears: 14, phone: '9800000001', consultationFee: 800, userEmail: 'ravi@hms.local' },
  { firstName: 'Meena', lastName: 'Iyer', registrationNo: 'MH-GMED-1002', specialization: 'General Physician', dept: 'GMED', qualification: 'MBBS, MD', experienceYears: 9, phone: '9800000002', consultationFee: 500, userEmail: 'meena@hms.local' },
  { firstName: 'Arjun', lastName: 'Nair', registrationNo: 'MH-ORTHO-1003', specialization: 'Orthopedic Surgeon', dept: 'ORTHO', qualification: 'MBBS, MS (Ortho)', experienceYears: 12, phone: '9800000003', consultationFee: 700 },
  { firstName: 'Kavya', lastName: 'Reddy', registrationNo: 'MH-PEDIA-1004', specialization: 'Pediatrician', dept: 'PEDIA', qualification: 'MBBS, DCH', experienceYears: 7, phone: '9800000004', consultationFee: 600 },
  { firstName: 'Sanjay', lastName: 'Gupta', registrationNo: 'MH-GYNE-1005', specialization: 'Gynecologist', dept: 'GYNE', qualification: 'MBBS, MS (OBG)', experienceYears: 11, phone: '9800000005', consultationFee: 650 },
];

const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const fullWeekAvailability = WEEK.map((day) => ({ day, from: '09:00', to: '17:00' }));

const PATIENTS = [
  { firstName: 'Amit', lastName: 'Kumar', gender: 'MALE', dob: '1988-04-12', phone: '9811100001', bloodGroup: 'B+', city: 'Mumbai' },
  { firstName: 'Sneha', lastName: 'Patel', gender: 'FEMALE', dob: '1995-09-23', phone: '9811100002', bloodGroup: 'O+', city: 'Pune' },
  { firstName: 'Rohan', lastName: 'Mehta', gender: 'MALE', dob: '1979-01-05', phone: '9811100003', bloodGroup: 'A+', city: 'Mumbai' },
  { firstName: 'Pooja', lastName: 'Singh', gender: 'FEMALE', dob: '2001-12-30', phone: '9811100004', bloodGroup: 'AB+', city: 'Nashik' },
  { firstName: 'Imran', lastName: 'Shaikh', gender: 'MALE', dob: '1966-07-19', phone: '9811100005', bloodGroup: 'O-', city: 'Thane' },
  { firstName: 'Baby', lastName: 'Reddy', gender: 'FEMALE', dob: '2020-03-15', phone: '9811100006', bloodGroup: 'B+', city: 'Mumbai' },
];

const LAB_TESTS = [
  { name: 'Complete Blood Count (CBC)', code: 'CBC', category: 'Hematology', sampleType: 'BLOOD', unit: 'cells/mcL', referenceRange: '4.5-11 x10^3', price: 350 },
  { name: 'Fasting Blood Sugar', code: 'FBS', category: 'Biochemistry', sampleType: 'BLOOD', unit: 'mg/dL', referenceRange: '70-100', price: 120 },
  { name: 'Lipid Profile', code: 'LIPID', category: 'Biochemistry', sampleType: 'BLOOD', unit: 'mg/dL', referenceRange: 'varies', price: 800 },
  { name: 'Liver Function Test', code: 'LFT', category: 'Biochemistry', sampleType: 'BLOOD', unit: 'U/L', referenceRange: 'varies', price: 900 },
  { name: 'Kidney Function Test', code: 'KFT', category: 'Biochemistry', sampleType: 'BLOOD', unit: 'mg/dL', referenceRange: 'varies', price: 900 },
  { name: 'Thyroid Profile (T3 T4 TSH)', code: 'THYROID', category: 'Endocrinology', sampleType: 'BLOOD', unit: 'varies', referenceRange: 'varies', price: 700 },
  { name: 'Urine Routine', code: 'URINE-R', category: 'Pathology', sampleType: 'URINE', unit: '', referenceRange: 'Normal', price: 200 },
  { name: 'HbA1c', code: 'HBA1C', category: 'Biochemistry', sampleType: 'BLOOD', unit: '%', referenceRange: '4-5.6', price: 550 },
];

const RAD_TESTS = [
  { name: 'Chest X-Ray PA View', code: 'XR-CHEST', modality: 'XRAY', bodyPart: 'Chest', price: 400 },
  { name: 'X-Ray Knee AP/Lateral', code: 'XR-KNEE', modality: 'XRAY', bodyPart: 'Knee', price: 500 },
  { name: 'CT Scan Brain Plain', code: 'CT-BRAIN', modality: 'CT', bodyPart: 'Brain', price: 3000 },
  { name: 'MRI Lumbar Spine', code: 'MRI-LSPINE', modality: 'MRI', bodyPart: 'Spine', price: 6500 },
  { name: 'USG Abdomen', code: 'USG-ABD', modality: 'ULTRASOUND', bodyPart: 'Abdomen', price: 1200 },
  { name: 'ECG', code: 'ECG', modality: 'ECG', bodyPart: 'Heart', price: 300 },
];

const MEDICINES = [
  { name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'Analgesic', manufacturer: 'Cipla', unit: 'TABLET', mrp: 2, purchasePrice: 1, sellingPrice: 2, minStock: 100 },
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'Antibiotic', manufacturer: 'Sun Pharma', unit: 'CAPSULE', mrp: 8, purchasePrice: 5, sellingPrice: 8, minStock: 50 },
  { name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'Antibiotic', manufacturer: 'Alkem', unit: 'TABLET', mrp: 25, purchasePrice: 16, sellingPrice: 25, minStock: 30 },
  { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', category: 'Antacid', manufacturer: 'Dr Reddy', unit: 'TABLET', mrp: 6, purchasePrice: 3, sellingPrice: 6, minStock: 60 },
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine', category: 'Antihistamine', manufacturer: 'Mankind', unit: 'TABLET', mrp: 3, purchasePrice: 1.5, sellingPrice: 3, minStock: 80 },
  { name: 'Metformin 500mg', genericName: 'Metformin', category: 'Antidiabetic', manufacturer: 'USV', unit: 'TABLET', mrp: 4, purchasePrice: 2, sellingPrice: 4, minStock: 100 },
  { name: 'Amlodipine 5mg', genericName: 'Amlodipine', category: 'Antihypertensive', manufacturer: 'Cipla', unit: 'TABLET', mrp: 5, purchasePrice: 2.5, sellingPrice: 5, minStock: 80 },
  { name: 'ORS Sachet', genericName: 'Oral Rehydration Salt', category: 'Electrolyte', manufacturer: 'FDC', unit: 'SACHET', mrp: 20, purchasePrice: 12, sellingPrice: 20, minStock: 40 },
];

const VENDORS = [
  { name: 'MediSupply Distributors', code: 'VEND-MEDI', contactPerson: 'Ashok Jain', phone: '9820000001', email: 'sales@medisupply.example', address: 'Andheri, Mumbai' },
  { name: 'HealthFirst Pharma', code: 'VEND-HF', contactPerson: 'Rekha Nair', phone: '9820000002', email: 'orders@healthfirst.example', address: 'Pune' },
  { name: 'SurgiCare Equipments', code: 'VEND-SURGI', contactPerson: 'Manoj Rao', phone: '9820000003', email: 'info@surgicare.example', address: 'Navi Mumbai' },
];

const INVENTORY = [
  { name: 'Surgical Gloves (Box)', code: 'INV-GLOVE', category: 'CONSUMABLE', unit: 'box', currentStock: 120, minStock: 20, unitPrice: 250 },
  { name: 'Disposable Syringe 5ml', code: 'INV-SYR5', category: 'CONSUMABLE', unit: 'piece', currentStock: 500, minStock: 100, unitPrice: 4 },
  { name: 'Cotton Roll 500g', code: 'INV-COTTON', category: 'CONSUMABLE', unit: 'roll', currentStock: 60, minStock: 15, unitPrice: 90 },
  { name: 'IV Cannula 18G', code: 'INV-CANNULA', category: 'SURGICAL', unit: 'piece', currentStock: 200, minStock: 50, unitPrice: 22 },
  { name: 'Digital BP Monitor', code: 'INV-BPMON', category: 'EQUIPMENT', unit: 'piece', currentStock: 8, minStock: 3, unitPrice: 1800 },
  { name: 'A4 Paper Ream', code: 'INV-PAPER', category: 'OFFICE', unit: 'ream', currentStock: 40, minStock: 10, unitPrice: 300 },
];

// Wards → rooms → beds. bedsPerRoom beds are created in each room.
const WARDS = [
  { name: 'General Ward A', code: 'GW-A', type: 'GENERAL', floor: '1', rooms: 3, bedsPerRoom: 4, dailyCharge: 1000 },
  { name: 'Private Ward', code: 'PW', type: 'PRIVATE', floor: '2', rooms: 4, bedsPerRoom: 1, dailyCharge: 4000 },
  { name: 'ICU', code: 'ICU', type: 'ICU', floor: '3', rooms: 2, bedsPerRoom: 3, dailyCharge: 8000 },
  { name: 'Pediatric Ward', code: 'PEDW', type: 'PEDIATRIC', floor: '1', rooms: 2, bedsPerRoom: 3, dailyCharge: 1500 },
];

async function upsert(Model, filter, doc) {
  await Model.updateOne(filter, { $set: doc }, { upsert: true });
  return Model.findOne(filter);
}

async function seedBody() {
  if (FRESH) {
    console.log('⚠  --fresh: wiping demo collections (keeps roles + admin)…');
    await Promise.all([
      Doctor.deleteMany({}), Patient.deleteMany({}), LabTest.deleteMany({}),
      RadiologyTest.deleteMany({}), Medicine.deleteMany({}), MedicineBatch.deleteMany({}),
      Vendor.deleteMany({}), InventoryItem.deleteMany({}),
      Ward.deleteMany({}), Room.deleteMany({}), Bed.deleteMany({}),
    ]);
  }

  // 1. Roles
  for (const def of ROLE_DEFINITIONS) {
    await Role.updateOne({ name: def.name }, { $set: def }, { upsert: true });
  }
  console.log(`✓ Roles: ${ROLE_DEFINITIONS.length}`);

  // 2. Departments
  const deptByCode = {};
  for (const dep of DEPARTMENTS) {
    const d = await upsert(Department, { code: dep.code }, dep);
    deptByCode[dep.code] = d._id;
  }
  console.log(`✓ Departments: ${DEPARTMENTS.length}`);

  // 3. Admin
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@hms.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  if (!(await User.findOne({ email: adminEmail }))) {
    const admin = new User({ name: 'System Administrator', email: adminEmail, role: ROLES.SUPER_ADMIN, status: 'ACTIVE' });
    await admin.setPassword(adminPassword);
    await admin.save();
    console.log(`✓ Created SUPER_ADMIN: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`• Admin exists: ${adminEmail}`);
  }

  // 4. Staff logins (one per role)
  const userByEmail = {};
  let staffCreated = 0;
  for (const s of STAFF) {
    let u = await User.findOne({ email: s.email });
    if (!u) {
      u = new User({
        name: s.name, email: s.email, role: s.role, status: 'ACTIVE',
        department: s.dept ? deptByCode[s.dept] : null,
      });
      await u.setPassword(s.password);
      await u.save();
      staffCreated += 1;
    }
    userByEmail[s.email] = u._id;
  }
  console.log(`✓ Staff logins: ${STAFF.length} (${staffCreated} new)`);

  // 5. Doctors
  for (const d of DOCTORS) {
    await upsert(Doctor, { registrationNo: d.registrationNo }, {
      firstName: d.firstName, lastName: d.lastName, registrationNo: d.registrationNo,
      specialization: d.specialization, department: deptByCode[d.dept],
      qualification: d.qualification, experienceYears: d.experienceYears,
      phone: d.phone, email: d.userEmail || '', consultationFee: d.consultationFee,
      availability: fullWeekAvailability, status: 'ACTIVE',
      user: d.userEmail ? userByEmail[d.userEmail] || null : null,
    });
  }
  console.log(`✓ Doctors: ${DOCTORS.length}`);

  // 6. Patients (skip if any already exist unless --fresh, to avoid UHID churn)
  const patientCount = await Patient.countDocuments();
  if (FRESH || patientCount === 0) {
    for (const p of PATIENTS) {
      const patient = new Patient({
        firstName: p.firstName, lastName: p.lastName, gender: p.gender,
        dateOfBirth: new Date(p.dob), phone: p.phone, bloodGroup: p.bloodGroup,
        address: { city: p.city, state: 'Maharashtra' },
      });
      await patient.save(); // triggers UHID generation
    }
    console.log(`✓ Patients: ${PATIENTS.length}`);
  } else {
    console.log(`• Patients exist (${patientCount}) — skipped (use --fresh to reseed)`);
  }

  // 6b. Demo patient-portal login, linked to the first patient.
  const firstPatient = await Patient.findOne().sort({ createdAt: 1 });
  if (firstPatient && !(await User.findOne({ email: 'patient@hms.local' }))) {
    const pu = new User({
      name: [firstPatient.firstName, firstPatient.lastName].filter(Boolean).join(' '),
      email: 'patient@hms.local', phone: firstPatient.phone,
      role: ROLES.PATIENT, patient: firstPatient._id, status: 'ACTIVE',
    });
    await pu.setPassword('Patient@123');
    await pu.save();
    console.log('✓ Demo patient login: patient@hms.local / Patient@123');
  }

  // 7. Lab & Radiology test catalogues
  for (const t of LAB_TESTS) await upsert(LabTest, { code: t.code }, t);
  for (const t of RAD_TESTS) await upsert(RadiologyTest, { code: t.code }, t);
  console.log(`✓ Lab tests: ${LAB_TESTS.length}, Radiology tests: ${RAD_TESTS.length}`);

  // 8. Medicines + one non-expired batch each
  for (const m of MEDICINES) {
    const med = await upsert(Medicine, { name: m.name }, { ...m, currentStock: 0 });
    const initialQty = m.minStock * 5;
    const hasBatch = await MedicineBatch.findOne({ medicine: med._id });
    if (!hasBatch) {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      await MedicineBatch.create({
        medicine: med._id, batchNo: `B-${m.genericName.slice(0, 4).toUpperCase()}-001`,
        expiryDate: expiry, quantity: initialQty, receivedQuantity: initialQty,
        purchasePrice: m.purchasePrice, mrp: m.mrp,
      });
      await Medicine.updateOne({ _id: med._id }, { $set: { currentStock: initialQty } });
    }
  }
  console.log(`✓ Medicines: ${MEDICINES.length} (with stock batches)`);

  // 9. Vendors + Inventory
  for (const v of VENDORS) await upsert(Vendor, { code: v.code }, v);
  for (const i of INVENTORY) await upsert(InventoryItem, { code: i.code }, i);
  console.log(`✓ Vendors: ${VENDORS.length}, Inventory items: ${INVENTORY.length}`);

  // 10. Wards → Rooms → Beds
  let bedTotal = 0;
  for (const w of WARDS) {
    const ward = await upsert(Ward, { code: w.code }, {
      name: w.name, code: w.code, type: w.type, floor: w.floor,
      department: null, status: 'ACTIVE',
    });
    for (let r = 1; r <= w.rooms; r += 1) {
      const roomNo = `${w.code}-${String(r).padStart(2, '0')}`;
      const room = await upsert(Room, { ward: ward._id, roomNo }, { ward: ward._id, roomNo, status: 'ACTIVE' });
      for (let b = 1; b <= w.bedsPerRoom; b += 1) {
        const bedNo = `${roomNo}-B${b}`;
        const exists = await Bed.findOne({ room: room._id, bedNo });
        if (!exists) {
          await Bed.create({
            bedNo, room: room._id, ward: ward._id,
            status: 'AVAILABLE', dailyCharge: w.dailyCharge,
          });
          bedTotal += 1;
        }
      }
    }
  }
  console.log(`✓ Wards: ${WARDS.length} (${bedTotal} new beds)`);

  // 11. Sample clinical + billing data for the demo patient, so the portal
  //     has something to show. Idempotent: only runs if none exists yet.
  const demoPatient = await Patient.findOne().sort({ createdAt: 1 });
  const demoDoctor = await Doctor.findOne({ registrationNo: 'MH-CARD-1001' });
  if (demoPatient && demoDoctor && (await OPDVisit.countDocuments({ patient: demoPatient._id })) === 0) {
    // Upcoming appointment (7 days out).
    const future = new Date(); future.setDate(future.getDate() + 7); future.setHours(0, 0, 0, 0);
    await new Appointment({
      patient: demoPatient._id, doctor: demoDoctor._id, department: demoDoctor.department,
      date: future, time: '10:30', type: 'NEW', status: 'BOOKED', reason: 'General checkup',
    }).save();

    // A completed OPD visit with a prescription.
    await new OPDVisit({
      patient: demoPatient._id, doctor: demoDoctor._id, department: demoDoctor.department,
      visitDate: new Date(), status: 'COMPLETED',
      vitals: { bp: '120/80', pulse: 74, temperature: 98.6, spo2: 98, weight: 70 },
      symptoms: 'Mild fever and headache for 2 days',
      diagnosis: 'Viral fever',
      clinicalNotes: 'Advised rest and hydration. Review after 5 days if not improving.',
      prescription: [
        { medicine: 'Paracetamol 500mg', dosage: '500 mg', frequency: '1-0-1', duration: '5 days', route: 'ORAL', instructions: 'After food', quantity: 10 },
        { medicine: 'Cetirizine 10mg', dosage: '10 mg', frequency: '0-0-1', duration: '3 days', route: 'ORAL', instructions: 'At night', quantity: 3 },
      ],
    }).save();

    // An invoice (consultation + lab), partially paid.
    const inv = new Invoice({
      patient: demoPatient._id,
      items: [
        { category: 'CONSULTATION', description: 'Cardiology consultation', quantity: 1, unitPrice: 800 },
        { category: 'LABORATORY', description: 'Complete Blood Count (CBC)', quantity: 1, unitPrice: 350 },
      ],
      discount: 0, taxPercent: 0, paidAmount: 800,
    });
    inv.recompute();
    await inv.save();

    console.log('✓ Demo clinical data for', demoPatient.uhid, '(appointment, OPD visit, invoice)');
  }

  console.log('\n✓ Seed complete');
  console.log('  Admin:', adminEmail, '/', adminPassword);
  console.log('  Demo staff password pattern: <Role>@123 (e.g. Doctor@123, Nurse@123)');
}

async function seed() {
  await connectDB(process.env.MONGODB_URI);
  const arg = (process.argv.find((a) => a.startsWith('--tenant=')) || '').split('=')[1];
  const slug = (arg || env.defaultTenantSlug).toLowerCase();
  const tenant = slug === env.defaultTenantSlug ? await ensureDefaultTenant() : await getTenantBySlug(slug);
  if (!tenant) { console.error('✗ Unknown tenant:', slug, '(create it first)'); process.exit(1); }
  const conn = tenantConnection(tenant.dbName);
  console.log(`Seeding tenant "${tenant.slug}" → ${tenant.dbName}`);
  await runWithTenant({ tenant, conn }, seedBody);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
