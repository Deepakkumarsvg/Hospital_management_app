import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configurable file-storage layer. Today it writes to local disk; the same
// interface (save/remove/resolvePath) can later be backed by S3/GCS by
// swapping this module's implementation — callers don't change.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';

// Ensure a subdirectory exists under the upload root.
export function ensureDir(subdir = '') {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Absolute path for a stored key (relative path like "patients/<id>/<file>").
export function resolvePath(storageKey) {
  return path.join(UPLOAD_ROOT, storageKey);
}

// Delete a stored file; ignore if already gone.
export function removeFile(storageKey) {
  const full = resolvePath(storageKey);
  fs.promises.unlink(full).catch(() => {});
}

// S3/GCS extension point:
//   Set STORAGE_DRIVER=s3 and implement save/get/remove here backed by
//   @aws-sdk/client-s3 (install separately). resolvePath()/removeFile() are the
//   only touch-points callers use, so swapping the backend is contained here.
export function storageInfo() {
  return { driver: STORAGE_DRIVER, root: STORAGE_DRIVER === 'local' ? UPLOAD_ROOT : undefined };
}

export { UPLOAD_ROOT };
