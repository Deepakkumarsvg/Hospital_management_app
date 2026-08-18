// Database queries slow enough to be a defect — almost always a missing index.
//
// The slow-REQUEST monitor says "GET /api/patients took four seconds"; this
// says which query inside it did, and on which fields. That second half is the
// difference between a symptom and a fix: `Patient.find(tenant, phone)` at
// 2.8s names the compound index that does not exist.
//
// Attached from db/registry.js, which is the one place every schema in the
// system passes through — a model added next year is covered without anyone
// remembering to opt it in.
//
// Off unless SLOW_QUERY_MS is set. The hooks themselves are cheap, but they run
// on every query in the application, and a feature that costs something on the
// hot path should be a decision rather than a default.

export const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 0);

// errorTracking is loaded on first use rather than imported at the top.
//
// It reads the ErrorLog MODEL, which registers itself through db/registry.js —
// which is what loads this file. Importing it here would close that loop into
// a genuine cycle, and cycles through the model registry fail in the worst
// possible way: not at boot, but later, on whichever model happened to be
// imported first that day. Deferring it to the first slow query — by
// definition, long after boot — keeps the graph acyclic.
let capture = null;
async function captureSlowQuery(payload) {
  capture ??= (await import('./errorTracking.js')).captureSlowQuery;
  return capture(payload);
}

// Hooked per operation rather than with a single wildcard, because mongoose
// resolves the hook name at registration time.
const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
  'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
];

export function slowQueryPlugin(schema) {
  if (!SLOW_QUERY_MS) return;

  for (const op of QUERY_OPS) {
    schema.pre(op, function markStart() {
      this._slowQueryStartedAt = process.hrtime.bigint();
    });

    schema.post(op, function measure() {
      report(this, op);
    });
  }

  // Aggregations are where the genuinely expensive work happens in this app —
  // the dashboards and the revenue reports — so they are worth the extra hook.
  schema.pre('aggregate', function markStart() {
    this._slowQueryStartedAt = process.hrtime.bigint();
  });
  schema.post('aggregate', function measure() {
    report(this, 'aggregate', Object.keys(this.pipeline?.()?.[0] || {}));
  });
}

function report(ctx, op, keys = null) {
  try {
    const startedAt = ctx?._slowQueryStartedAt;
    if (!startedAt) return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs < SLOW_QUERY_MS) return;

    captureSlowQuery({
      model: ctx.model?.modelName || ctx._model?.modelName || 'Unknown',
      op,
      durationMs,
      // Only the SHAPE of the query is recorded. The keys are what identify the
      // missing index; the values are patient data and have no business in an
      // operational log.
      filterKeys: keys ?? Object.keys(ctx.getFilter?.() || {}),
    }).catch(() => {});
  } catch {
    // Measurement must never break the query it is measuring.
  }
}
