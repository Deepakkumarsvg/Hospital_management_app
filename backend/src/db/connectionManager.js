// Resolves database handles. All tenant databases share the ONE base connection
// pool via mongoose's useDb() — so 1..N tenants do not multiply sockets.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SCHEMAS } from './registry.js';

// Register every known schema on a connection so that ref population
// (e.g. .populate('department')) can resolve models on the same connection.
function ensureModels(conn) {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    if (!conn.models[name]) conn.model(name, schema);
  }
  return conn;
}

// A tenant's database handle (cached by mongoose across calls), with all models
// registered on it.
export function tenantConnection(dbName) {
  return ensureModels(mongoose.connection.useDb(dbName, { useCache: true }));
}

// The control-plane database handle (holds the Tenant registry).
export function controlConnection() {
  return mongoose.connection.useDb(env.controlDb, { useCache: true });
}
