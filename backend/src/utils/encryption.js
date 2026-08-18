// Field-level encryption for free-text clinical notes.
//
// SCOPE — and why it is deliberately narrow:
//
// Encrypting a field in the application makes it opaque to the database, which
// means it can no longer be searched, sorted or indexed. Patient names, phone
// numbers and UHIDs are searched on every screen in this system, so encrypting
// them here would not "harden" anything — it would break the product, and the
// usual workarounds (blind indexes, deterministic encryption) leak most of what
// the encryption was protecting anyway.
//
// The right control for identifiers is encryption at rest at the storage layer
// (Atlas encryption-at-rest, an encrypted volume, or mongod Enterprise's
// --enableEncryption), combined with database authentication, least-privilege
// access and the audit trail. Those cover the whole dataset, including indexes
// and the oplog, without breaking a single query.
//
// What genuinely benefits from field-level encryption is the narrative content
// that is never queried and is the most sensitive thing in the record: what the
// patient said, what the clinician concluded. That is what this covers.
//
// OPT-IN: with no PHI_ENCRYPTION_KEY set, values are stored as-is and nothing
// changes. That is what makes it safe to switch on for an existing deployment —
// old plaintext keeps reading correctly, and new writes are encrypted.
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// Marks a value this module wrote, so plaintext written before the key existed
// is still readable. Chosen to be something no clinician would ever type.
const PREFIX = 'enc:v1:';

function loadKey() {
  const raw = process.env.PHI_ENCRYPTION_KEY;
  if (!raw) return null;

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    // Failing at boot is far kinder than discovering it on the first note that
    // needs decrypting six months from now.
    throw new Error(
      'PHI_ENCRYPTION_KEY must be 32 bytes, base64-encoded. Generate one with:\n'
      + '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  return key;
}

let cachedKey;
const key = () => (cachedKey === undefined ? (cachedKey = loadKey()) : cachedKey);

export const isEncryptionEnabled = () => key() !== null;

export function encrypt(plaintext) {
  const k = key();
  if (!k || plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  if (typeof plaintext !== 'string') return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted

  // A fresh IV per value: reusing one under GCM is catastrophic, not merely weak.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, k, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) {
    // Either plaintext written before encryption was switched on, or empty.
    return value;
  }

  const k = key();
  if (!k) {
    // The data is encrypted but the key is gone. Say so plainly rather than
    // returning ciphertext that would be shown to a clinician as if it were
    // the note itself.
    return '[encrypted — PHI_ENCRYPTION_KEY is not configured]';
  }

  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);

    const decipher = crypto.createDecipheriv(ALGORITHM, k, iv);
    decipher.setAuthTag(tag); // GCM: fails loudly if the value was tampered with
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '[encrypted — could not be decrypted with the configured key]';
  }
}

// Schema field definition for an encrypted free-text field.
//
// Mongoose getters and setters make this transparent: services read and write
// ordinary strings, and only the stored value differs.
export const encryptedText = (extra = {}) => ({
  type: String,
  default: '',
  set: encrypt,
  get: decrypt,
  ...extra,
});
