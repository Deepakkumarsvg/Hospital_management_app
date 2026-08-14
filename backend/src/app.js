import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import routes from './routes/index.js';
import { resolveTenant, tenantScope } from './middleware/tenant.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

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

  // Security & parsing
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL || '*',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Basic rate limiting on the API surface.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'HMS API', data: { version: '1.0.0' } });
  });

  // Resolve tenant + bind its DB connection into async context before any route.
  app.use('/api', resolveTenant, tenantScope, routes);

  // 404 + centralized error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
