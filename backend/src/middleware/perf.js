// Requests that finished, but took long enough to be a defect.
//
// A 200 that arrived after nine seconds is not a success — it is a receptionist
// with a queue in front of them wondering whether to click again. Nothing else
// in the system notices it: the error handler never sees it, the audit trail
// records the action rather than its cost, and the pino line scrolls past.
//
// Two things make this cheap enough to leave on in production:
//
//   • only requests OVER the threshold are written, so a healthy server writes
//     nothing at all; and
//   • they group by endpoint (services/errorTracking.js), so a slow endpoint
//     hit all afternoon is one row whose count goes up, not a table nobody can
//     read.
//
// MUST be mounted after tenantScope. The measurement lands on the response's
// 'finish' event, and the tenant connection reaches that callback through
// AsyncLocalStorage — which only propagates to listeners registered while the
// context is active.
import { captureSlowRequest } from '../services/errorTracking.js';

// 0 disables the monitor entirely.
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 3000);

// Endpoints where "slow" is either meaningless or self-inflicted, and would
// otherwise be the only thing in the list.
const IGNORED = new Set(['/health', '/errors/report']);

// Exports, PDFs and imports are legitimately slow — a 40-page discharge summary
// takes as long as it takes, and flagging it every time trains people to ignore
// the screen this feeds.
const SLOW_BY_NATURE = /\/(export|download|print|invoice-pdf|seed)(\/|$)/i;

export function slowRequestMonitor(req, res, next) {
  if (!SLOW_REQUEST_MS) return next();
  if (IGNORED.has(req.path) || SLOW_BY_NATURE.test(req.path)) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs < SLOW_REQUEST_MS) return;

    captureSlowRequest({
      method: req.method,
      // req.route is only populated once a router has matched, which by
      // 'finish' it has; originalUrl is the fallback for anything that 404'd.
      path: req.baseUrl ? req.baseUrl + (req.route?.path || '') : req.originalUrl,
      durationMs,
      statusCode: res.statusCode,
      req,
    });
  });

  next();
}
