import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { ensureDir } from '../config/storage.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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

// Wrap multer to translate its errors into our ApiError shape.
export function handlePatientUpload(req, res, next) {
  uploadPatientDoc(req, res, (err) => {
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

export function handleClaimUpload(req, res, next) {
  uploadClaimDoc(req, res, (err) => {
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

export function handleLogoUpload(req, res, next) {
  uploadLogoFile(req, res, (err) => {
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
