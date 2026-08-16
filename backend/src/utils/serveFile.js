// Serving stored files back to a browser, safely.
//
// Uploaded documents are attacker-influenced content served from the app's own
// origin. Uploads are content-verified (see middleware/upload.js), but these
// headers are the second line: they make the response inert even if something
// unexpected ever reaches storage. The browser may not re-sniff a type of its
// own choosing, may not run scripts or fetch anything, and may not be framed.
//
// The bytes are streamed from the storage driver rather than read from a
// path, so this works unchanged on local disk and on S3.
import { getObjectStream } from '../config/storage.js';
import { ApiError } from './ApiError.js';

// Types we are willing to let a browser render inline. Anything else is sent
// as an opaque download, whatever the stored record claims.
const RENDERABLE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function setSafeHeaders(res, mimeType) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; object-src 'none'; sandbox");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Type', mimeType);
}

// Send a stored file. `inline` renders it in the tab (viewing a report);
// otherwise it downloads. An inline request for a type we don't render falls
// back to a download rather than failing.
export async function serveStoredFile(res, { storageKey, mimeType, originalName }, { inline = false } = {}) {
  let object;
  try {
    object = await getObjectStream(storageKey);
  } catch {
    // The record exists but its bytes don't — a half-deleted document, or a
    // file lost with an ephemeral disk. Say so rather than hanging.
    throw ApiError.notFound('This file is no longer available', 'FILE_MISSING');
  }

  const renderInline = inline && RENDERABLE_TYPES.has(mimeType);
  // Typed as a generic binary when downloading, on purpose: the browser then
  // has no reason to interpret the bytes at all.
  setSafeHeaders(res, renderInline ? mimeType : 'application/octet-stream');

  const disposition = renderInline ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(originalName || 'download')}"`);
  if (object.contentLength) res.setHeader('Content-Length', object.contentLength);

  object.stream.on('error', () => res.destroy());
  object.stream.pipe(res);
}
