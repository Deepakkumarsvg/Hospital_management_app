// Graceful shutdown sequencing.
//
// This can't be exercised by signalling a real child process — Windows has no
// SIGTERM to deliver — so the handler takes its side effects as dependencies
// and they are stubbed here.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { installShutdownHandlers } from '../src/shutdown.js';

// A stand-in for an http.Server: close() runs its callback once the (fake)
// in-flight requests have drained.
function fakeServer({ drainMs = 0 } = {}) {
  const server = {
    closed: false,
    close(cb) {
      server.closed = true;
      setTimeout(cb, drainMs);
    },
  };
  return server;
}

const listeners = [];
function install(server, deps) {
  const before = new Set(process.listeners('SIGTERM'));
  const shutdown = installShutdownHandlers(server, deps);
  listeners.push(...process.listeners('SIGTERM').filter((l) => !before.has(l)));
  return shutdown;
}

afterEach(() => {
  // Handlers are registered on the shared process object; don't leak them
  // into other test files. uncaughtException especially: a stray listener
  // there would intercept a genuine failure in a later test and report it as
  // a shutdown instead.
  for (const l of listeners.splice(0)) process.off('SIGTERM', l);
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('unhandledRejection');
  process.removeAllListeners('uncaughtException');
});

describe('graceful shutdown', () => {
  it('stops the server, closes the database, then exits 0 — in that order', async () => {
    const order = [];
    const server = fakeServer();
    const exit = vi.fn((code) => order.push(`exit:${code}`));
    const closeDb = vi.fn(async () => order.push('closeDb'));

    const shutdown = install(server, { exit, closeDb, log: () => {}, warn: () => {}, error: () => {} });
    await shutdown('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(server.closed).toBe(true);
    // The database must be closed only after the server stopped accepting
    // work, never while a request could still be using it.
    expect(order).toEqual(['closeDb', 'exit:0']);
  });

  it('waits for in-flight requests instead of cutting them off', async () => {
    const server = fakeServer({ drainMs: 60 });
    const exit = vi.fn();
    const shutdown = install(server, { exit, closeDb: async () => {}, log: () => {}, warn: () => {}, error: () => {} });

    await shutdown('SIGTERM');
    expect(exit).not.toHaveBeenCalled(); // still draining
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('ignores a second signal rather than restarting the sequence', async () => {
    const server = fakeServer();
    const closeDb = vi.fn(async () => {});
    const exit = vi.fn();
    const shutdown = install(server, { exit, closeDb, log: () => {}, warn: () => {}, error: () => {} });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGTERM'), shutdown('SIGINT')]);
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(closeDb).toHaveBeenCalledTimes(1);
  });

  it('gives up and exits non-zero if draining never finishes', async () => {
    // A hung request would otherwise keep the process alive until the platform
    // SIGKILLs it, losing the chance to close anything cleanly.
    const server = { close() { /* callback never runs */ } };
    const exit = vi.fn();
    const shutdown = install(server, {
      exit, closeDb: async () => {}, timeoutMs: 20,
      log: () => {}, warn: () => {}, error: () => {},
    });

    await shutdown('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });

  it('still exits when closing the database fails', async () => {
    const server = fakeServer();
    const exit = vi.fn();
    const shutdown = install(server, {
      exit,
      closeDb: async () => { throw new Error('connection already gone'); },
      log: () => {}, warn: () => {}, error: () => {},
    });

    await shutdown('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });

  it('registers handlers for the signals a platform actually sends', () => {
    const before = process.listenerCount('SIGTERM');
    install(fakeServer(), { exit: () => {}, closeDb: async () => {}, log: () => {} });
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
  });
});
