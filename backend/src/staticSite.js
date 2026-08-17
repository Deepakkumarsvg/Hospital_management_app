// Serve the built frontend from the API process.
//
// This is what makes a single-service deployment possible: one container, one
// URL, and the browser talking to its own origin. That removes CORS, the
// cross-origin cookie question, and the pair of URLs that otherwise have to be
// kept in sync between the frontend host and the API.
//
// It is optional. If the build isn't present — which is the case in
// development, where Vite serves the frontend and proxies /api — none of this
// is mounted and the API behaves exactly as before.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the Docker build puts the frontend, then where it sits in a plain
// checkout.
const DEFAULT_CANDIDATES = [
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, '../../frontend/dist'),
];

const hasBuild = (dir) => fs.existsSync(path.join(dir, 'index.html'));

export function findFrontendBuild() {
  // An explicit FRONTEND_DIST is the whole answer, not the first guess — it
  // has to be able to say "serve this exact build" and equally "there is no
  // build", which the tests rely on. Falling back to the defaults would make
  // the mode depend on whether someone happened to run `npm run build`.
  if (process.env.FRONTEND_DIST) {
    return hasBuild(process.env.FRONTEND_DIST) ? process.env.FRONTEND_DIST : null;
  }
  return DEFAULT_CANDIDATES.find(hasBuild) || null;
}

// CSP hashes for the inline scripts in the built index.html.
//
// index.html carries one on purpose: it reads the saved theme and sets the
// class before first paint, so a dark-mode user doesn't get a white flash.
// A strict `script-src 'self'` blocks it, and the usual escape hatch —
// 'unsafe-inline' — would also permit any script an attacker managed to
// inject, which is the whole thing CSP is there to stop.
//
// Hashing whatever is actually in the built file keeps the policy strict and
// keeps it correct: change the script, or let Vite inject one of its own, and
// the hash follows automatically.
export function inlineScriptHashes(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const inline = html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
  return [...inline].map(
    (m) => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`
  );
}

export function mountStaticSite(app, distDir) {
  const dist = distDir || findFrontendBuild();
  if (!dist) return null;

  // Hashed asset filenames change whenever their contents do, so they can be
  // cached indefinitely.
  app.use(
    '/assets',
    express.static(path.join(dist, 'assets'), {
      immutable: true,
      maxAge: '1y',
      fallthrough: false,
    })
  );

  // Everything else in the build (favicon, manifest, sw.js). index.html is
  // served by the SPA fallback below, never from here, so it can't be cached.
  app.use(
    express.static(dist, {
      index: false,
      maxAge: '1h',
      setHeaders(res, filePath) {
        // A cached service worker pins users to a stale app shell across
        // deploys — it has to be revalidated every time.
        if (path.basename(filePath) === 'sw.js') {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      },
    })
  );

  // SPA fallback. React Router owns every path that isn't the API, so a hard
  // refresh on /patients/123 has to return the app shell rather than a 404.
  //
  // /api is excluded deliberately: an unknown API route must stay a JSON 404
  // from the API's own handler, not silently return HTML that the client will
  // fail to parse.
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });

  return dist;
}
