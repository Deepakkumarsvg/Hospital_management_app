// Central registry of Mongoose schemas, keyed by model name.
//
// Model files call register('User', userSchema) at import time instead of
// binding to a fixed connection. The per-tenant proxy (tenantModel) then binds
// the schema onto whichever tenant connection is active for the request.
export const SCHEMAS = {};

export function register(name, schema) {
  SCHEMAS[name] = schema;
  return name;
}

export function schemaFor(name) {
  const s = SCHEMAS[name];
  if (!s) throw new Error(`No schema registered for model "${name}"`);
  return s;
}
