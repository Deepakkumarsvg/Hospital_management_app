// Per-request tenant context, propagated via AsyncLocalStorage so model access
// deep inside services resolves to the correct tenant database without threading
// a `db` argument through every function signature.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

// Run `fn` (and everything it awaits) with the given tenant + connection bound.
export function runWithTenant(store, fn) {
  return als.run(store, fn);
}

export function currentStore() {
  return als.getStore() || null;
}

export function currentConnection() {
  const store = als.getStore();
  if (!store?.conn) {
    throw new Error('No tenant context — request ran outside runWithTenant()');
  }
  return store.conn;
}

export function currentTenant() {
  return als.getStore()?.tenant || null;
}
