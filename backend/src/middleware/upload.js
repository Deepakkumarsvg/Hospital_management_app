import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { sniffMimeType } from '../utils/fileType.js';
import { buildKey, randomFilename, putObject } from '../config/storage.js';

const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

// The hospital logo is embedded directly into printed invoices and
// prescriptions, and PDFKit only handles JPEG/PNG.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Uploads are buffered in memory, then handed to the storage driver.
//
// Writing to disk first would tie this middleware to the local driver, and
// would mean a rejected file had to be cleaned up after the fact. 5 MB is
// small enough that buffering costs nothing, and it lets the contents be
// inspected before anything is persisted anywhere.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
}).single('file');

// Build one upload handler.
//
// `keyPrefix(req)` decides where the file lands; `allowed` is the set of media
// types this route accepts, checked against the file's ACTUAL bytes.
//
// multer's own fileFilter is deliberately not used: it can only see the
// client's declared Content-Type, which is a claim, not a fact. Anyone can
// upload an HTML file labelled `image/png`, and if that label is later echoed
// back on download the browser renders it as a page on our origin, with the
// viewer's session.
function uploadHandler(keyPrefix, allowed) {
  return (req, res, next) => {
    memoryUpload(req, res, async (err) => {
      try {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(ApiError.badRequest('File too large (max 5 MB)', 'FILE_TOO_LARGE'));
          }
          return next(err);
        }
        if (!req.file) return next(ApiError.badRequest('No file uploaded', 'NO_FILE'));

        const actual = sniffMimeType(req.file.buffer);
        if (!actual || !allowed.has(actual)) {
          const label = allowed === IMAGE_TYPES ? 'a JPG or PNG image' : 'a PDF or image';
          return next(ApiError.badRequest(
            `That file is not ${label} — its contents do not match its type`,
            'FILE_CONTENT_MISMATCH'
          ));
        }

        // Everything downstream uses the sniffed type, never the declared one.
        req.file.mimetype = actual;
        req.file.storageKey = buildKey(keyPrefix(req), randomFilename(req.file.originalname));
        await putObject(req.file.storageKey, req.file.buffer, actual);

        // The bytes are persisted; don't keep them alive in the request.
        req.file.buffer = null;
        next();
      } catch (e) {
        next(e);
      }
    });
  };
}

// Patient documents:   patients/<patientId>/<random>.<ext>
export const handlePatientUpload = uploadHandler((req) => buildKey('patients', req.params.id), ALLOWED);

// Insurance claim documents:  claims/<claimId>/<random>.<ext>
export const handleClaimUpload = uploadHandler((req) => buildKey('claims', req.params.id), ALLOWED);

// Hospital logo — a single shared file, so it gets its own fixed folder.
export const handleLogoUpload = uploadHandler(() => 'branding', IMAGE_TYPES);

// In-memory CSV upload for bulk-import flows — nothing is stored, the parsed
// buffer is handed straight to the importer. CSV has no magic bytes to check.
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  fileFilter(_req, file, cb) {
    if (!/\.csv$/i.test(file.originalname) && file.mimetype !== 'text/csv') {
      return cb(ApiError.badRequest('Only .csv files are allowed', 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_BYTES },
}).single('file');

export function handleCsvUpload(req, res, next) {
  uploadCsv(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('File too large (max 5 MB)', 'FILE_TOO_LARGE'));
      }
      return next(err);
    }
    if (!req.file) return next(ApiError.badRequest('No file uploaded', 'NO_FILE'));
    next();
  });
}
