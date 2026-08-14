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
