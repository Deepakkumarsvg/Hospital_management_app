// The first thing the server imports, and it has to stay that way.
//
// Sentry traces by monkey-patching http, express and the mongodb driver as
// those modules load. ES modules are evaluated in import order, so anything
// imported above this line is already in memory by the time Sentry.init runs
// and is never instrumented — the app boots, errors still report, and tracing
// is silently empty. Keeping the init in its own module is what makes the
// ordering explicit instead of a comment in server.js that a tidy-up removes.
//
// dotenv first, because the DSN lives in the same .env as everything else and
// config/env.js has not run yet at this point.
import 'dotenv/config';
import { initSentry } from './config/sentry.js';

if (initSentry()) {
  console.log('✓ Sentry error tracking enabled');
}
