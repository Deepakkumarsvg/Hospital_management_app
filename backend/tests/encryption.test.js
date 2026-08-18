// Free-text clinical notes are encrypted at rest when a key is configured.
//
// The scope is deliberately narrow — see utils/encryption.js. Encrypting the
// searchable identifiers would break every screen in the product without
// buying much, so those are covered by storage-level encryption and access
// control instead. What is covered here is the narrative content: what the
// patient reported and what the clinician concluded.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

// The key has to exist before the module reads it.
process.env.PHI_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { Patient } = await import('../src/models/Patient.js');
const { encrypt, decrypt, isEncryptionEnabled } = await import('../src/utils/encryption.js');

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => { await Patient.deleteMany({}); });
});

const newPatient = (extra = {}) => Patient.create({
  firstName: 'Kiran', lastName: 'Bose', gender: 'FEMALE',
  dateOfBirth: '1979-11-04', phone: '9000000071', ...extra,
});

describe('the cipher itself', () => {
  it('is enabled when a key is configured', () => {
    expect(isEncryptionEnabled()).toBe(true);
  });

  it('round-trips a value', () => {
    const secret = 'Severe penicillin allergy — anaphylaxis 2019';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('produces different ciphertext for the same input each time', () => {
    // A fixed IV would leak which patients share a diagnosis.
    const a = encrypt('Type 2 diabetes');
    const b = encrypt('Type 2 diabetes');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it('leaves empty values alone', () => {
    expect(encrypt('')).toBe('');
    expect(encrypt(null)).toBeNull();
  });

  it('does not double-encrypt', () => {
    const once = encrypt('note');
    expect(encrypt(once)).toBe(once);
  });

  it('reads back plaintext written before encryption was switched on', () => {
    // Existing rows must keep working — this is what makes it safe to enable
    // on a live database without a migration.
    expect(decrypt('an old unencrypted note')).toBe('an old unencrypted note');
  });

  it('refuses a value that has been tampered with', () => {
    const enc = encrypt('original note');
    // Flip a character in the ciphertext body.
    const tampered = enc.slice(0, -4) + (enc.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    expect(decrypt(tampered)).toMatch(/could not be decrypted/);
  });
});

describe('stored patient records', () => {
  it('writes clinical notes to the database as ciphertext', () => inTenant(async () => {
    const p = await newPatient({
      allergies: 'Penicillin, Sulfa',
      medicalHistory: 'Hypertension since 2015',
    });

    // Straight from the driver, bypassing the schema getters.
    const raw = await Patient.collection.findOne({ _id: p._id });
    expect(raw.allergies).toMatch(/^enc:v1:/);
    expect(raw.allergies).not.toContain('Penicillin');
    expect(raw.medicalHistory).not.toContain('Hypertension');
  }));

  it('reads them back transparently', () => inTenant(async () => {
    const p = await newPatient({ allergies: 'Penicillin, Sulfa' });
    const found = await Patient.findById(p._id);
    expect(found.allergies).toBe('Penicillin, Sulfa');
  }));

  it('returns them decrypted in JSON', () => inTenant(async () => {
    const p = await newPatient({ allergies: 'Latex' });
    expect((await Patient.findById(p._id)).toJSON().allergies).toBe('Latex');
  }));

  it('leaves the searchable identifiers in plaintext so search still works', () => inTenant(async () => {
    await newPatient({ firstName: 'Searchable', allergies: 'Aspirin' });

    const raw = await Patient.collection.findOne({ firstName: 'Searchable' });
    expect(raw).toBeTruthy();                       // findable by name
    expect(raw.phone).toBe('9000000071');           // and by phone
    expect(raw.allergies).toMatch(/^enc:v1:/);      // while the note is not
  }));

  it('still supports the drug-allergy check, which reads the decrypted value', () => inTenant(async () => {
    const p = await newPatient({ allergies: 'Penicillin' });
    const opd = await import('../src/services/opdService.js');

    const { warnings } = await opd.checkAllergies(p._id, ['Penicillin 500mg', 'Paracetamol']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].medicine).toBe('Penicillin 500mg');
  }));
});
