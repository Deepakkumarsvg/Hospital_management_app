import { Setting } from '../models/Setting.js';

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
