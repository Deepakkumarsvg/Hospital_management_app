// File storage, behind one interface with two drivers.
//
//   local — writes under backend/uploads. Fine for development and for a
//           deployment with a real persistent volume (docker compose).
//   s3    — any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2).
//           Required on hosts with ephemeral disks (Render, Fly, Heroku),
//           where anything written locally is lost on the next deploy.
//
// Callers only ever deal in a `storageKey` — a forward-slashed relative path
// like "patients/<id>/<random>.pdf" — and never learn which driver is behind
// it. That is what lets the driver be switched with an env var.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

export const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const isS3 = STORAGE_DRIVER === 's3';

// Storage keys are always forward-slashed: they double as S3 object keys, and
// path.join() would produce backslashes on Windows.
export function buildKey(...parts) {
  return parts.filter(Boolean).join('/').replace(/\\/g, '/');
}

// A collision-proof filename that keeps the original extension.
export function randomFilename(originalName = '') {
  const ext = path.extname(originalName).slice(0, 10).toLowerCase();
  return `${crypto.randomBytes(12).toString('hex')}${ext}`;
}

// Reject anything that would escape the storage root. Keys are built
// server-side today, but this is the one place that assumption is enforced.
function assertSafeKey(key) {
  const clean = String(key || '').replace(/\\/g, '/');
  if (!clean || clean.startsWith('/') || clean.split('/').includes('..')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return clean;
}

// ---------------------------------------------------------------- local ----

const localPath = (key) => path.join(UPLOAD_ROOT, assertSafeKey(key));

const localDriver = {
  async put(key, body) {
    const full = localPath(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, body);
    return key;
  },
  async getStream(key) {
    const full = localPath(key);
    const { size } = await fs.promises.stat(full);
    return { stream: fs.createReadStream(full), contentLength: size };
  },
  getBuffer: (key) => fs.promises.readFile(localPath(key)),
  async remove(key) {
    await fs.promises.unlink(localPath(key)).catch(() => {});
  },
  info: () => ({ driver: 'local', root: UPLOAD_ROOT }),
};

// ------------------------------------------------------------------- s3 ----

// The client is built lazily so a local-driver deployment never has to have
// S3 credentials configured, and never pays to load the SDK.
let s3Client = null;
let S3Commands = null;

async function s3() {
  if (!s3Client) {
    const sdk = await import('@aws-sdk/client-s3');
    S3Commands = sdk;
    s3Client = new sdk.S3Client({
      region: process.env.S3_REGION || 'auto',
      // Set for R2/B2/MinIO; omit for AWS S3 itself.
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      // R2 and MinIO need path-style addressing.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return { client: s3Client, ...S3Commands };
}

const bucket = () => process.env.S3_BUCKET;

const s3Driver = {
  async put(key, body, contentType) {
    const { client, PutObjectCommand } = await s3();
    await client.send(new PutObjectCommand({
      Bucket: bucket(),
      Key: assertSafeKey(key),
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }));
    return key;
  },
  async getStream(key) {
    const { client, GetObjectCommand } = await s3();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: assertSafeKey(key) }));
    return { stream: res.Body, contentLength: res.ContentLength };
  },
  async getBuffer(key) {
    const { stream } = await s3Driver.getStream(key);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  },
  async remove(key) {
    const { client, DeleteObjectCommand } = await s3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: assertSafeKey(key) })).catch(() => {});
  },
  info: () => ({ driver: 's3', bucket: bucket(), endpoint: process.env.S3_ENDPOINT || 'aws' }),
};

// ---------------------------------------------------------------- public ---

const driver = isS3 ? s3Driver : localDriver;

// Store bytes under `key`. `contentType` is only meaningful for S3, where it
// is what the object is served back as.
export const putObject = (key, body, contentType) => driver.put(key, body, contentType);

// A readable stream plus its length, for piping to an HTTP response.
export const getObjectStream = (key) => driver.getStream(key);

// The whole object in memory — only for small files (the hospital logo, which
// PDFKit has to embed synchronously).
export const getObjectBuffer = (key) => driver.getBuffer(key);

// Delete. Never throws: a missing file must not fail the record deletion that
// triggered it.
export const removeObject = (key) => driver.remove(key);

export const storageInfo = () => driver.info();

// Fails fast at startup rather than on the first upload of the day.
export function validateStorageConfig() {
  if (!isS3) return;
  const missing = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(', ')}`);
  }
}

export { UPLOAD_ROOT, Readable };
