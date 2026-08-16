import fs from 'fs';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { ensureDir } from '../config/storage.js';
import { ApiError } from '../utils/ApiError.js';
import { sniffFileMimeType } from '../utils/fileType.js';

const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Re-derive the media type from the file's own bytes and overwrite the
// client's claim with it.
//
// multer's fileFilter can only see the declared Content-Type, and it runs
// before any bytes arrive — so it cannot tell a real PNG from an HTML file
// labelled as one. This runs after the upload has landed, rejects anything
// whose contents aren't on the allowlist, and deletes the file it rejects.
function verifyFileContents(allowed) {
  return async (req, _res, next) => {
    try {
      const actual = await sniffFileMimeType(req.file.path);
      if (!actual || !allowed.has(actual)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(ApiError.badRequest(
          'That file is not a valid PDF or image — its contents do not match its type',
          'FILE_CONTENT_MISMATCH'
        ));
      }
      // Everything downstream (the stored record, the download response) must
      // use the sniffed type, never the declared one.
      req.file.mimetype = actual;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Store patient documents under uploads/patients/<patientId>/<random>.<ext>
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      const dir = ensureDir(path.join('patients', req.params.id));
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).slice(0, 10);
    const name = crypto.randomBytes(12).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only PDF, JPG, PNG or WEBP files are allowed', 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
}

export const uploadPatientDoc = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('file');

// Wrap a multer handler: translate its errors into our ApiError shape, then
// verify the uploaded bytes actually are what they claim to be.
function uploadHandler(upload, allowed) {
  const verify = verifyFileContents(allowed);
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest('File too large (max 5 MB)', 'FILE_TOO_LARGE'));
        }
        return next(err);
      }
      if (!req.file) return next(ApiError.badRequest('No file uploaded', 'NO_FILE'));
      verify(req, res, next);
    });
  };
}

export const handlePatientUpload = uploadHandler(uploadPatientDoc, ALLOWED);

// Store claim documents under uploads/claims/<claimId>/<random>.<ext>
const claimStorage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      const dir = ensureDir(path.join('claims', req.params.id));
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).slice(0, 10);
    const name = crypto.randomBytes(12).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

export const uploadClaimDoc = multer({
  storage: claimStorage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('file');

export const handleClaimUpload = uploadHandler(uploadClaimDoc, ALLOWED);

// Hospital logo — a single shared file, so it lives under its own fixed
// folder rather than a per-record one. Restricted to JPEG/PNG since that's
// what PDFKit can embed directly on printed invoices/prescriptions.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const logoStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      const dir = ensureDir('branding');
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).slice(0, 10);
    const name = crypto.randomBytes(12).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

export const uploadLogoFile = multer({
  storage: logoStorage,
  fileFilter(_req, file, cb) {
    if (!IMAGE_TYPES.has(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG or PNG images are allowed', 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_BYTES },
}).single('file');

export const handleLogoUpload = uploadHandler(uploadLogoFile, IMAGE_TYPES);

// In-memory CSV upload for bulk-import flows — nothing is written to disk,
// the parsed buffer is handed straight to the importer.
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
