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
  process.on('unhandledRejection', (reason) => {
    error('✗ Unhandled promise rejection:', reason);
    shutdown('unhandledRejection');
  });

  return shutdown; // exposed for tests
}
