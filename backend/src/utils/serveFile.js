// Serving stored files back to a browser, safely.
//
// Uploaded documents are attacker-influenced content served from the app's own
// origin. Uploads are content-verified (see middleware/upload.js), but these
// headers are the second line: they make the response inert even if something
// unexpected ever reaches disk. The browser may not re-sniff a type of its own
// choosing, may not run scripts or fetch anything, and may not be framed.
import { resolvePath } from '../config/storage.js';

// Types we are willing to let a browser render inline. Anything else is sent
// as an opaque download, whatever the stored record claims.
const RENDERABLE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function setSafeHeaders(res, mimeType) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'none'; sandbox");
  res.setHeader('X-Frame-Options', 'DENY');
  // Set before sendFile/download, which only fill in a type if none is set.
  res.setHeader('Content-Type', mimeType);
}

// Send a stored file. `inline` renders it in the tab (viewing a report);
// otherwise it downloads. An inline request for a type we don't render falls
// back to a download rather than failing.
export function serveStoredFile(res, { storageKey, mimeType, originalName }, { inline = false } = {}) {
  if (inline && RENDERABLE_TYPES.has(mimeType)) {
    setSafeHeaders(res, mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName || 'file')}"`);
    return res.sendFile(resolvePath(storageKey));
  }

  // Typed as a generic binary on purpose: the browser then has no reason to
  // interpret the bytes at all.
  setSafeHeaders(res, 'application/octet-stream');
  return res.download(resolvePath(storageKey), originalName || 'download');
}
