// Graceful shutdown.
//
// Every deploy and every container restart sends SIGTERM. Without a handler
// the process dies immediately, cutting off requests mid-flight — a half-
// written invoice, a truncated PDF download — and dropping the MongoDB
// connection without closing it.
//
// So: stop accepting new connections, let the in-flight ones finish, then
// close the database.
import mongoose from 'mongoose';
import { closeRateLimitStore } from './config/rateLimitStore.js';
import { captureToSentry, flushSentry } from './config/sentry.js';

const FORCE_EXIT_MS = 15_000;

// `deps` exists so this can be tested without terminating the test runner.
export function installShutdownHandlers(server, deps = {}) {
  const {
    exit = process.exit,
    closeDb = () => mongoose.connection.close(),
    log = console.log,
    warn = console.warn,
    error = console.error,
    timeoutMs = FORCE_EXIT_MS,
    flush = flushSentry,
    capture = captureToSentry,
  } = deps;

  let shuttingDown = false;

  async function shutdown(signal) {
    // Orchestrators often send SIGTERM and then SIGKILL; a second signal must
    // not restart the sequence.
    if (shuttingDown) return;
    shuttingDown = true;
    log(`\n${signal} received — finishing in-flight requests…`);

    // A request that has hung would otherwise keep the process alive forever,
    // and the platform would SIGKILL us anyway. Give it a bounded window.
    const forceExit = setTimeout(() => {
      warn('⚠ Shutdown timed out — exiting anyway');
      exit(1);
    }, timeoutMs);
    if (typeof forceExit.unref === 'function') forceExit.unref();

    server.close(async () => {
      clearTimeout(forceExit);
      try {
        // The report explaining WHY the process is going down is the one that
        // must not be lost to the exit that follows it. Sentry batches events,
        // so a crash captured milliseconds ago is still in a buffer here.
        await flush().catch(() => {});
        // Redis holds an open socket that would keep the process alive past
        // the database close; it carries no state worth preserving, so it goes
        // first and its failure never blocks the shutdown.
        await closeRateLimitStore().catch(() => {});
        await closeDb();
        log('✓ Closed cleanly');
        exit(0);
      } catch (err) {
        error('✗ Error during shutdown:', err.message);
        exit(1);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state. Log it
  // loudly and shut down rather than serving requests from a process whose
  // invariants may no longer hold.
  //
  // These two are the crashes that never reach the central error handler —
  // nothing is holding a response, so there is no request to fail — which
  // makes them precisely the ones that used to vanish into a log tail. They go
  // to Sentry rather than to ErrorLog because there is no tenant context here
  // to say which hospital's database to write to, and because a process on its
  // way out may no longer be able to write at all.
  process.on('unhandledRejection', (reason) => {
    error('✗ Unhandled promise rejection:', reason);
    capture(reason instanceof Error ? reason : new Error(String(reason)), {
      level: 'fatal',
      tags: { source: 'backend', mechanism: 'unhandledRejection' },
    });
    shutdown('unhandledRejection');
  });

  // An uncaught exception is the same situation reached by a different route,
  // and was previously not handled at all: Node prints the stack and exits
  // immediately, skipping the drain, the database close and the report.
  process.on('uncaughtException', (err) => {
    error('✗ Uncaught exception:', err);
    capture(err, { level: 'fatal', tags: { source: 'backend', mechanism: 'uncaughtException' } });
    shutdown('uncaughtException');
  });

  return shutdown; // exposed for tests
}
