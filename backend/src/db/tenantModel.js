// A stand-in for a Mongoose model that transparently forwards to the model bound
// on the CURRENT tenant's connection. Lets existing code keep calling
// `User.findById(...)`, `new User(...)`, `User.aggregate(...)` unchanged while
// routing to the right database per request.
import { currentConnection } from './tenantContext.js';
import { schemaFor } from './registry.js';

function resolve(name) {
  const conn = currentConnection();
  // Register the schema on this connection once; reuse thereafter.
  return conn.models[name] || conn.model(name, schemaFor(name));
}

export function tenantModel(name) {
  return new Proxy(
    function tenantModelStub() {},
    {
      // Static access & methods: User.findById, User.create, User.aggregate…
      get(_target, prop) {
        const model = resolve(name);
        const value = model[prop];
        return typeof value === 'function' ? value.bind(model) : value;
      },
      // `new User(doc)` → a real document on the tenant connection.
      construct(_target, args) {
        const Model = resolve(name);
        return new Model(...args);
      },
      // Allow `instanceof` and static property checks to behave sensibly.
      has(_target, prop) {
        return prop in resolve(name);
      },
    }
  );
}
