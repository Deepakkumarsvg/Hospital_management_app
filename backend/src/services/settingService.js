import { Setting } from '../models/Setting.js';
import { removeObject } from '../config/storage.js';

// Fields a client is allowed to update (everything except key/system fields).
const EDITABLE = [
  'hospitalName', 'tagline', 'addressLine', 'city', 'state', 'pincode',
  'phone', 'email', 'website', 'registrationNo', 'gstin', 'currency',
  'defaultTaxPercent', 'invoiceFooter',
];

// Fetch the singleton, creating it with defaults on first access.
export async function getSettings() {
  let doc = await Setting.findOne({ key: 'hospital' });
  if (!doc) doc = await Setting.create({ key: 'hospital' });
  return doc;
}

// Unauthenticated-safe subset — just enough to brand the login screen.
// Deliberately excludes contact/tax/registration details, which stay behind auth.
export async function getPublicSettings() {
  const doc = await getSettings();
  return {
    hospitalName: doc.hospitalName,
    tagline: doc.tagline,
    hasLogo: !!doc.logo?.storageKey,
  };
}

export async function updateSettings(data, userId) {
  const update = {};
  for (const field of EDITABLE) {
    if (data[field] !== undefined) update[field] = data[field];
  }
  update.updatedBy = userId || null;
  const doc = await Setting.findOneAndUpdate(
    { key: 'hospital' },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
}

export async function setLogo(file, userId) {
  const existing = await getSettings();
  if (existing.logo?.storageKey) await removeObject(existing.logo.storageKey);

  const doc = await Setting.findOneAndUpdate(
    { key: 'hospital' },
    { $set: { logo: { storageKey: file.storageKey, mimeType: file.mimetype, originalName: file.originalname }, updatedBy: userId || null } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
}

export async function removeLogo(userId) {
  const existing = await getSettings();
  if (existing.logo?.storageKey) await removeObject(existing.logo.storageKey);
  const doc = await Setting.findOneAndUpdate(
    { key: 'hospital' },
    { $set: { logo: { storageKey: '', mimeType: '', originalName: '' }, updatedBy: userId || null } },
    { new: true }
  );
  return doc;
}
