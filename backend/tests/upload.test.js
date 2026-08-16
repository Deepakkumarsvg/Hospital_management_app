// Upload/download safety for patient documents.
//
// The threat: a file whose declared type is a lie. Multer only ever sees the
// client's Content-Type claim, so an HTML page can be uploaded as "image/png"
// and, if that label is echoed back on download, rendered on our own origin
// with the viewing clinician's session.
import fs from 'fs';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';
import { sniffMimeType } from '../src/utils/fileType.js';
import { resolvePath } from '../src/config/storage.js';

const { Patient } = await import('../src/models/Patient.js');
const { PatientDocument } = await import('../src/models/PatientDocument.js');

let token;
let patientId;

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  token = await login('admin@test.local', 'Admin@123');
});
afterAll(async () => {
  await disconnectTestDb();
  // These tests write real files; don't leave them in the working tree.
  for (const dir of uploadedDirs) {
    await fs.promises.rm(resolvePath(dir), { recursive: true, force: true }).catch(() => {});
  }
});

const uploadedDirs = new Set();

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([Patient.deleteMany({}), PatientDocument.deleteMany({})]);
    const p = await Patient.create({
      firstName: 'Asha', lastName: 'Rao', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '9000000030',
    });
    patientId = p._id.toString();
    uploadedDirs.add(`patients/${patientId}`);
  });
});

// Minimal but genuine file headers.
const REAL_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const REAL_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');

const upload = (buffer, filename, contentType) =>
  request(app)
    .post(`/api/patients/${patientId}/documents`)
    .set(auth(token))
    .attach('file', buffer, { filename, contentType });

describe('sniffMimeType', () => {
  it('identifies the formats we accept from their bytes', () => {
    expect(sniffMimeType(REAL_PNG)).toBe('image/png');
    expect(sniffMimeType(REAL_PDF)).toBe('application/pdf');
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMimeType(Buffer.concat([
      Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'),
    ]))).toBe('image/webp');
  });

  it('returns null for anything else', () => {
    expect(sniffMimeType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffMimeType(Buffer.from('GIF89a'))).toBeNull(); // not on the allowlist
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });
});

describe('patient document upload', () => {
  it('accepts a genuine PDF', async () => {
    const res = await upload(REAL_PDF, 'report.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('application/pdf');
  });

  it('rejects HTML disguised as a PNG', async () => {
    const res = await upload(
      Buffer.from('<html><script>fetch("/api/patients")</script></html>'),
      'photo.png',
      'image/png'
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('FILE_CONTENT_MISMATCH');
    // Nothing may be left behind on disk or in the collection.
    await inTenant(async () => {
      expect(await PatientDocument.countDocuments({})).toBe(0);
    });
  });

  it('rejects a file whose declared type is not allowed at all', async () => {
    const res = await upload(Buffer.from('MZ\x90\x00'), 'setup.exe', 'application/x-msdownload');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  it('stores the sniffed type, not the declared one', async () => {
    // A real PDF sent with an image content-type — the record must say PDF.
    const res = await upload(REAL_PDF, 'scan.jpg', 'image/jpeg');
    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('application/pdf');
  });
});

describe('patient document download', () => {
  it('serves an inline view with headers that keep it inert', async () => {
    const { body: created } = await upload(REAL_PDF, 'report.pdf', 'application/pdf');

    const res = await request(app)
      .get(`/api/patients/${patientId}/documents/${created.data._id}/download?inline=true`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('forces a download as an opaque binary when not inline', async () => {
    const { body: created } = await upload(REAL_PNG, 'photo.png', 'image/png');

    const res = await request(app)
      .get(`/api/patients/${patientId}/documents/${created.data._id}/download`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`/api/patients/${patientId}/documents`);
    expect(res.status).toBe(401);
  });
});
