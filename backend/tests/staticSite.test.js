// Single-service mode: the API process also serves the built frontend.
//
// The things that must hold: /api keeps its own behaviour (a JSON 404, never
// the app shell), client-side routes get the shell so a hard refresh works,
// and the CSP is strict enough to be worth having while still allowing the
// one inline script index.html ships with.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
// Imported for its side effects too: it sets the test environment up, and
// (importantly) sets FRONTEND_DIST — so it has to land before we point that at
// our own fixture below.
import { connectTestDb, disconnectTestDb } from './helpers.js';

// A minimal stand-in for a Vite build, including an inline script like the
// real index.html's theme-before-paint snippet.
const INLINE_SCRIPT = "\n  (function(){ document.documentElement.classList.add('dark'); })();\n";
const INDEX_HTML = `<!doctype html>
<html><head><title>HMS</title><script>${INLINE_SCRIPT}</script></head>
<body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body></html>`;

let dist;
let app;

let createApp;

beforeAll(async () => {
  dist = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hms-dist-'));
  await fs.promises.mkdir(path.join(dist, 'assets'), { recursive: true });
  await fs.promises.writeFile(path.join(dist, 'index.html'), INDEX_HTML);
  await fs.promises.writeFile(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("app")');
  await fs.promises.writeFile(path.join(dist, 'sw.js'), '// service worker');
  await fs.promises.writeFile(path.join(dist, 'favicon.svg'), '<svg/>');

  // The API routes need a database — an /api request that can't reach one now
  // answers 503, which would mask the 404 this file is checking for.
  await connectTestDb();

  // Read when the app is built, not when the module loads, so flipping it and
  // calling createApp() again is all it takes to switch modes.
  process.env.FRONTEND_DIST = dist;
  ({ createApp } = await import('../src/app.js'));
  app = createApp();
});

afterAll(async () => {
  await disconnectTestDb();
  await fs.promises.rm(dist, { recursive: true, force: true }).catch(() => {});
  process.env.FRONTEND_DIST = '/nonexistent-frontend-build';
});

describe('serving the frontend from the API process', () => {
  it('serves the app shell at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
  });

  it('serves the app shell for a client-side route, so a hard refresh works', async () => {
    const res = await request(app).get('/patients/507f1f77bcf86cd799439011');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });

  it('never lets the shell shadow the API', async () => {
    // An unknown API route has to stay a JSON 404. Returning HTML here would
    // surface in the client as an unparseable response instead of an error.
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error).toBe('ROUTE_NOT_FOUND');
  });

  it('serves hashed assets as immutable, and never caches the shell', async () => {
    const asset = await request(app).get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    const shell = await request(app).get('/');
    expect(shell.headers['cache-control']).toContain('no-cache');
  });

  it('makes the service worker revalidate, so a deploy is not pinned', async () => {
    const res = await request(app).get('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('must-revalidate');
  });

  it('allows the inline theme script by hash, not by unsafe-inline', async () => {
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    const hash = crypto.createHash('sha256').update(INLINE_SCRIPT, 'utf8').digest('base64');

    expect(csp).toContain(`'sha256-${hash}'`);
    // The point of hashing is not having to open the door to every inline
    // script, so this must not have crept back in.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});

describe('API-only mode', () => {
  it('reports itself as the API when no build is present', async () => {
    process.env.FRONTEND_DIST = path.join(dist, 'does-not-exist');
    const apiOnly = createApp();
    try {
      const res = await request(apiOnly).get('/');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('HMS API');
    } finally {
      process.env.FRONTEND_DIST = dist;
    }
  });

  it('does not answer client-side routes when there is no build to serve', async () => {
    process.env.FRONTEND_DIST = path.join(dist, 'does-not-exist');
    const apiOnly = createApp();
    try {
      const res = await request(apiOnly).get('/patients/507f1f77bcf86cd799439011');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('ROUTE_NOT_FOUND');
    } finally {
      process.env.FRONTEND_DIST = dist;
    }
  });
});
