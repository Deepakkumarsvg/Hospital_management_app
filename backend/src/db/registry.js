// Central registry of Mongoose schemas, keyed by model name.
//
// Model files call register('User', userSchema) at import time instead of
// binding to a fixed connection. The per-tenant proxy (tenantModel) then binds
// the schema onto whichever tenant connection is active for the request.
import { slowQueryPlugin } from '../services/slowQuery.js';

export const SCHEMAS = {};

export function register(name, schema) {
  // Every schema in the system passes through here, which makes it the one
  // place slow-query timing can be attached without each model opting in — and
  // without a model added later being silently uninstrumented. The plugin is a
  // no-op unless SLOW_QUERY_MS is set.
  schema.plugin(slowQueryPlugin);

  SCHEMAS[name] = schema;
  return name;
}

export function schemaFor(name) {
  const s = SCHEMAS[name];
  if (!s) throw new Error(`No schema registered for model "${name}"`);
  return s;
}
