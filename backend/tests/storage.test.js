// The storage abstraction that lets uploads live on local disk or in an
// S3-compatible bucket without any caller knowing which.
import { describe, it, expect, afterAll } from 'vitest';
import {
  buildKey, randomFilename, putObject, getObjectStream, getObjectBuffer,
  removeObject, storageInfo,
} from '../src/config/storage.js';

const written = [];

afterAll(async () => {
  for (const key of written) await removeObject(key).catch(() => {});
});

async function store(key, body, type) {
  written.push(key);
  await putObject(key, body, type);
  return key;
}

describe('storage keys', () => {
  it('always uses forward slashes, whatever the platform', () => {
    // path.join() would produce backslashes on Windows, and these keys double
    // as S3 object keys where a backslash is a literal character in the name.
    expect(buildKey('patients', 'abc123', 'file.pdf')).toBe('patients/abc123/file.pdf');
    expect(buildKey('branding', 'logo.png')).toBe('branding/logo.png');
  });

  it('skips empty segments rather than producing a double slash', () => {
    expect(buildKey('claims', '', 'x.pdf')).toBe('claims/x.pdf');
  });

  it('generates a unique name while keeping the extension', () => {
    const a = randomFilename('Scan Report.PDF');
    const b = randomFilename('Scan Report.PDF');
    expect(a).toMatch(/^[0-9a-f]{24}\.pdf$/);
    expect(a).not.toBe(b);
  });

  it('drops a filename with no extension rather than inventing one', () => {
    expect(randomFilename('noextension')).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('storage driver', () => {
  it('defaults to local when STORAGE_DRIVER is unset', () => {
    expect(storageInfo().driver).toBe('local');
  });

  it('round-trips an object', async () => {
    const key = await store(buildKey('test', randomFilename('a.pdf')), Buffer.from('%PDF-1.7 hello'), 'application/pdf');

    const buffer = await getObjectBuffer(key);
    expect(buffer.toString()).toBe('%PDF-1.7 hello');

    const { stream, contentLength } = await getObjectStream(key);
    expect(contentLength).toBe(14);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe('%PDF-1.7 hello');
  });

  it('creates intermediate folders on the way', async () => {
    const key = await store(buildKey('test', 'deep', 'nested', randomFilename('b.png')), Buffer.from('png'));
    expect((await getObjectBuffer(key)).toString()).toBe('png');
  });

  it('removes an object, and tolerates removing one that is already gone', async () => {
    const key = buildKey('test', randomFilename('c.pdf'));
    await putObject(key, Buffer.from('bye'));
    await removeObject(key);

    await expect(getObjectBuffer(key)).rejects.toThrow();
    await expect(removeObject(key)).resolves.toBeUndefined(); // idempotent
  });

  it('refuses keys that would escape the storage root', async () => {
    // Keys are built server-side today, but this is the guard that keeps a
    // future caller from turning a user-supplied name into a path traversal.
    for (const bad of ['../secrets.env', 'patients/../../etc/passwd', '/absolute/path', '']) {
      await expect(putObject(bad, Buffer.from('x'))).rejects.toThrow(/Unsafe storage key/);
    }
  });
});
