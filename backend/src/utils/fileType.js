// Identify a file by its actual bytes.
//
// Multer's `file.mimetype` is copied straight from the multipart Content-Type
// the client sent — it is a claim, not a fact. Anyone can upload an HTML file
// labelled `image/png`; if that label is later echoed back on download, the
// browser renders it as a page on our origin, with the victim's session.
// So the label is re-derived here from the leading bytes and everything
// downstream uses that instead.
import fs from 'fs';

// Signatures long enough to be unambiguous for the formats we accept.
const SIGNATURES = [
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },            // %PDF
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WEBP is a RIFF container: "RIFF" ....(size).... "WEBP"
  { mime: 'image/webp', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
];

const HEADER_BYTES = 16;

function matches(header, { offset, bytes }) {
  if (header.length < offset + bytes.length) return false;
  return bytes.every((b, i) => header[offset + i] === b);
}

// The real media type of a buffer, or null if it isn't one we recognise.
export function sniffMimeType(header) {
  // WEBP needs both of its signature parts, so check it as a pair first.
  const riff = SIGNATURES.filter((s) => s.mime === 'image/webp');
  if (riff.every((s) => matches(header, s))) return 'image/webp';

  const hit = SIGNATURES.find((s) => s.mime !== 'image/webp' && matches(header, s));
  return hit?.mime || null;
}

// Same, for a file already written to disk.
export async function sniffFileMimeType(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return sniffMimeType(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
