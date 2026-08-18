import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// What actually went wrong on the live server, kept where you can query it.
//
// The process logs (pino → the host's log tail) already carry every stack
// trace, but they are a stream: they roll over, they cannot be searched by
// "which failure is hurting the most people", and nothing in them survives a
// redeploy. This collection is the durable half — one document per DISTINCT
// failure, not per occurrence.
//
// That grouping is the whole point. A broken endpoint hit two thousand times
// in an afternoon is one bug, and a list that shows it two thousand times is a
// list nobody reads. Occurrences increment `count` on the existing document and
// push a small sample; the row itself stays one row.
const errorLogSchema = new mongoose.Schema(
  {
    // Stable identity of the failure — see fingerprint() in
    // services/errorTracking.js. Everything else on the document is a fact
    // about the group; this is what decides which group an occurrence joins.
    // `unique` already builds the index; adding `index: true` alongside it
    // declares the same one twice and mongoose warns about it at boot.
    fingerprint: { type: String, required: true, unique: true },

    // Where it was thrown. Frontend entries arrive over POST /api/errors/report.
    source: { type: String, enum: ['backend', 'frontend'], required: true },

    // 'error' is a thrown failure; 'slow' is a request or query that completed
    // but took long enough to be a defect of its own. Both belong here because
    // both are answered the same way — open the group, read the samples, fix
    // the code — and a separate collection for the second kind would just mean
    // two screens to check instead of one.
    kind: { type: String, enum: ['error', 'slow'], default: 'error' },

    name: { type: String, default: 'Error' },      // TypeError, MongoServerError…
    message: { type: String, default: '' },
    stack: { type: String, default: '' },

    // Which build this came from, so a fix can be confirmed rather than
    // assumed: an error whose lastSeenAt predates the current release is
    // already gone. Set from APP_RELEASE (see config/release.js).
    release: { type: String, default: '' },
    environment: { type: String, default: '' },

    // The request that failed, normalised — /api/patients/:id rather than
    // /api/patients/66f1c0…, so the same bug on different records groups.
    method: { type: String, default: '' },
    route: { type: String, default: '' },
    statusCode: { type: Number, default: 0 },

    count: { type: Number, default: 1 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },

    // How many DIFFERENT signed-in accounts hit this, which is the number that
    // decides whether it is fixed today or this sprint. Capped, because the
    // distinction that matters is "one unlucky user" vs "the whole ward" and
    // an unbounded array of user ids on a hot error is a document that grows
    // without limit.
    affectedUsers: { type: [String], default: [] },

    // The last few occurrences, newest first. Capped at SAMPLE_LIMIT by the
    // capture path — a hot error must not grow a document without bound.
    samples: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, default: Date.now },
            // Correlates with the X-Request-Id on the pino log line, and with
            // the audit entry for the same call.
            requestId: { type: String, default: '' },
            userId: { type: String, default: '' },
            userName: { type: String, default: '' },
            userRole: { type: String, default: '' },
            ip: { type: String, default: '' },
            userAgent: { type: String, default: '' },
            // The real URL (frontend: the page; backend: the path as called).
            url: { type: String, default: '' },
            durationMs: { type: Number, default: 0 },
            extra: { type: mongoose.Schema.Types.Mixed, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Triage state. `resolved` is a claim about a specific build: if the same
    // fingerprint arrives from a later release, reopen() clears this, because
    // "we fixed that" and "it is still happening" cannot both be true.
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: '' },
    resolvedInRelease: { type: String, default: '' },

    // How many times this was marked fixed and came back.
    //
    // A group with reopenCount > 0 is a REGRESSION, and that is a different
    // problem from a new bug: somebody already looked at this one and was
    // wrong about it. Worth counting separately, because a rising number here
    // means fixes are not being verified rather than that the code is getting
    // worse.
    reopenCount: { type: Number, default: 0 },

    // Set when the same error is also in Sentry, so the row can link straight
    // to the trace/breadcrumbs Sentry has and this one does not.
    sentryEventId: { type: String, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// "What is broken right now" — the list this screen opens on.
errorLogSchema.index({ resolved: 1, lastSeenAt: -1 });
// "What is hurting the most people" — the list it sorts by next.
errorLogSchema.index({ resolved: 1, count: -1 });
errorLogSchema.index({ source: 1, kind: 1, lastSeenAt: -1 });

register("ErrorLog", errorLogSchema);
export const ErrorLog = tenantModel("ErrorLog");

// How many occurrence samples are kept per group. Ten is enough to spot "only
// one user" or "only on Safari" and small enough that a runaway error cannot
// bloat the document.
export const SAMPLE_LIMIT = 10;

// Distinct affected accounts recorded per group, for the same reason.
export const AFFECTED_USER_LIMIT = 50;

// How long a group is kept after its LAST occurrence.
//
// Unlike the audit log this is operational data with no retention obligation
// behind it: a bug nobody has hit for a month is either fixed or not worth the
// row. Applied as a TTL index by ensureErrorRetention() rather than declared
// here, because MongoDB cannot change expireAfterSeconds in place — see
// services/errorRetention.js. 0 disables expiry.
export const ERROR_RETENTION_DAYS = Number(process.env.ERROR_RETENTION_DAYS ?? 30);
