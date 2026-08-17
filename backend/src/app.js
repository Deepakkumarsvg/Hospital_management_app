import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import routes from './routes/index.js';
import { resolveTenant, tenantScope } from './middleware/tenant.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { findFrontendBuild, inlineScriptHashes, mountStaticSite } from './staticSite.js';

export function createApp() {
  const app = express();

  // Behind nginx (docker compose) every request arrives from the proxy's own
  // address. Without this, req.ip is that one address for everybody: per-IP
  // rate limits become a single shared budget, one busy client locks out the
  // whole hospital, and audit logs record the proxy instead of the user.
  //
  // The value is a HOP COUNT, not `true` — trusting the whole X-Forwarded-For
  // chain would let a client spoof its address by sending its own header.
  // Set TRUST_PROXY to the number of proxies actually in front of the app
  // (1 for the bundled nginx), or 0 when it is exposed directly.
  const trustProxy = Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0));
  app.set('trust proxy', trustProxy);

  // Structured request logging with a per-request id (X-Request-Id).
  // Quiet during tests. Level configurable via LOG_LEVEL.
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        // Quiet per-request spam in dev; verbose only when LOG_LEVEL is set.
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'warn'),
        genReqId: (req, res) => {
          const id = req.headers['x-request-id'] || crypto.randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        autoLogging: { ignore: (req) => req.url === '/api/health' },
      })
    );
  }

  // When the frontend is built into this image we serve it ourselves, which
  // changes what the security headers have to allow. Resolved up front because
  // helmet is configured from it.
  const dist = findFrontendBuild();

  // Security & parsing
  app.use(
    helmet(
      dist
        ? {
            // Serving HTML means the CSP now governs a real page, not just
            // JSON. Keep helmet's strict defaults and widen only what the
            // app genuinely needs — the inline theme script, by hash.
            contentSecurityPolicy: {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                'script-src': ["'self'", ...inlineScriptHashes(dist)],
                // Everything the client talks to is same-origin.
                'connect-src': ["'self'"],
                // Patient photos and generated QR codes are data: URIs.
                'img-src': ["'self'", 'data:', 'blob:'],
                // PDFs are opened in a new tab from a blob URL.
                'object-src': ["'none'"],
              },
            },
          }
        : undefined
    )
  );
  app.use(
    cors({
      origin: process.env.CLIENT_URL || '*',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Broad backstop against a single client hammering the API. Auth and other
  // sensitive endpoints set their own, much tighter budgets on top of this.
  //
  // NOTE: this is an in-memory store, so the budget is per process and resets
  // on restart. Running more than one API instance needs a shared store
  // (rate-limit-redis) for the limits to mean anything.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      // Health checks come from the orchestrator on a fixed address and would
      // otherwise eat the budget that address shares with real traffic.
      skip: (req) => req.path === '/health',
    })
  );

  // Resolve tenant + bind its DB connection into async context before any route.
  app.use('/api', resolveTenant, tenantScope, routes);

  // Serve the built frontend, when there is one (single-service deployment).
  // Mounted after the API so /api always wins, and before the 404 handler so
  // client-side routes resolve to the app shell.
  if (dist) {
    mountStaticSite(app, dist);
  } else {
    // No build present — this process is the API alone (development, or a
    // deployment where the frontend is hosted separately).
    app.get('/', (_req, res) => {
      res.json({ success: true, message: 'HMS API', data: { version: '1.0.0' } });
    });
  }

  // 404 + centralized error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
