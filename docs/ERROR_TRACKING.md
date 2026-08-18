# Error tracking

When something breaks on the live server, this is how you find out — and how the
stack trace gets from production to the machine where the fix is written.

There are two halves, and they are deliberately independent:

| | Self-hosted (`ErrorLog`) | Sentry |
|---|---|---|
| Setup | none — always on | set `SENTRY_DSN` |
| Where the data lives | the hospital's own MongoDB | Sentry's servers |
| Alerting | no (you go and look) | yes, within seconds |
| Survives a dead database | no | yes |
| Cost | nothing | free tier fits a hospital this size |

The self-hosted half is what makes this work with zero configuration and zero
third parties — which matters when the data in question is a stack trace from a
system full of patient records. Sentry is what tells you at 2am. Run either, or
both.

---

## What gets captured

| Source | Trigger | Wired in |
|---|---|---|
| Server | any 5xx response | `middleware/errorHandler.js` |
| Server | unhandled rejection, uncaught exception | `shutdown.js` |
| Server | request slower than `SLOW_REQUEST_MS` | `middleware/perf.js` |
| Server | query slower than `SLOW_QUERY_MS` | `services/slowQuery.js` |
| Browser | React render crash | `components/ErrorBoundary.jsx` |
| Browser | `window.onerror`, unhandled rejection | `services/errorReporting.js` |
| Browser | any 5xx from the API | `services/api.js` interceptor |

4xx responses are deliberately **not** captured. A rejected password or a failed
validation is the system working, and an error list full of those is an error
list nobody opens.

## Grouping

Reports are stored one row per **distinct failure**, not per occurrence. An
endpoint that broke four hundred times this afternoon is one row with
`count: 400`, not four hundred rows.

Two occurrences are the same failure when they share a fingerprint, built from
the error type, the message with ids and numbers normalised out, and the first
stack frame belonging to this codebase. So:

- `Cast to ObjectId failed for value "66f1…111"` and the same for `…999` group
  together — one bug, two patients.
- `/api/patients/66f1…/documents` and `/api/patients/771a…/documents` group
  together; the route normalises to `/api/patients/:id/documents`.
- The same message thrown from two different files does **not** group — those
  are two bugs that happen to fail the same way.

## Reading them

**In the app:** *Administration → Errors*. Needs the `errors:view` permission;
`errors:manage` adds resolve and delete. Sorted by most recent or most frequent,
with the stack trace, the last ten occurrences, and who hit them.

The header answers 'how are we doing' rather than just 'what happened':
open issues (and how many are still in the running build), distinct people
affected, occurrences with a today-vs-yesterday trend, regressions, and slow
endpoints. Each tile is a filter — clicking one narrows the list to what it
counted. Below them, a split of server vs browser failures and the worst
endpoints by volume.

**Exporting:** the CSV / Excel buttons download whatever the screen is
currently filtered to, capped at 5000 rows. The sheet carries the triage
columns plus a `Top frame` column — the file and line to open — and the full
stack in the last column, so a sprint's worth of failures can be handed to
whoever is planning the work without them needing access to this screen.

**In your working copy:**

```bash
cp .env.errors.example .env.errors     # once — fill in the URL and a login
npm run errors
```

That writes `.errors/live-errors.md` and `.errors/live-errors.json`. The
markdown is meant to be read directly, or handed to an AI assistant — it carries
the stack traces, so "billing is broken" arrives as `billingService.js:212`.

```bash
npm run errors -- --limit=50          # more of them
npm run errors -- --status=all        # resolved ones too
npm run errors -- --sort=frequency    # loudest first
npm run errors -- --source=sentry     # pull from Sentry instead
```

`.errors/` is gitignored: it is a snapshot of a live hospital that goes stale in
minutes. Re-run the command rather than committing it.

## Release tracking

Every group records the build it was last seen in, which is what makes "is that
fixed?" answerable — nothing arriving since the release containing the fix means
it is gone. Render, Vercel, Railway, Heroku and GitHub Actions all inject a
commit SHA that `config/release.js` picks up on its own, so this normally needs
no setup. Set `APP_RELEASE` yourself only if you build and tag images your own
way.

Marking a group resolved records the release it was resolved in. If the same
fingerprint arrives again it reopens itself — a fix that did not work must not
stay hidden behind the default filter.

## Configuration

All optional; the defaults are the intended setup.

| Variable | Default | What it does |
|---|---|---|
| `ERROR_RETENTION_DAYS` | `30` | Days a group is kept after its **last** occurrence. `0` keeps forever. |
| `SLOW_REQUEST_MS` | `3000` | Requests slower than this are recorded. `0` turns it off. |
| `SLOW_QUERY_MS` | *(off)* | Database queries slower than this are recorded. Switch on when hunting a slowdown — the hooks run on every query. |
| `ERROR_REPORT_RATE_LIMIT` | `30` | Browser reports allowed per IP per 5 minutes. |
| `SENTRY_DSN` | *(unset)* | Enables the Sentry half, server side. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Fraction of requests traced for performance. |
| `APP_RELEASE` | *(auto)* | Overrides the detected commit SHA. |

### Turning on Sentry

1. Create a free account and a project at [sentry.io](https://sentry.io).
2. Set `SENTRY_DSN` on the server — Render → Environment, or `backend/.env`.
3. For browser errors the DSN has to be compiled in. Vite inlines `VITE_*` at
   build time, so it is a **Docker build argument**, not a service variable:

   ```bash
   docker build --build-arg VITE_SENTRY_DSN=https://…@o0.ingest.sentry.io/0 .
   ```

Skip step 3 and browser crashes still reach `/errors` inside the app through the
self-hosted half — only the Sentry copy is missed, and the SDK is never
downloaded by the browser.

A DSN is a public value by design: it only permits *writing* events. Baking it
into the bundle is expected, not a leak.

## What is deliberately not recorded

This is a hospital system, so the reporting is built to be boring about data.

- **No request or response bodies** — not to Sentry (`sendDefaultPii: false`
  plus an explicit scrub in `config/sentry.js`), not to `ErrorLog`.
- **No query strings.** On this API they carry patient search terms. They are
  stripped from stored URLs and dropped entirely from fingerprints.
- **No Session Replay**, at any sample rate. It records the DOM, and on these
  screens the DOM is a patient's record.
- **No names or email addresses leave the estate.** Sentry gets a user id and a
  role; the staff name is stored only in the hospital's own database.
- **Query shapes, not query values.** A slow query records which *fields* it
  filtered on — that is what names the missing index — never what it searched
  for.

Stack traces and error messages **can** still contain data if application code
puts it there (`Duplicate value for email`, say). The `ErrorLog` collection
lives in the hospital's own database, covered by its backups and its retention
policy. If you enable Sentry, that is the one thing worth a look before pointing
it at a production hospital.

## Where the code is

```
backend/src/
  instrument.js                   Sentry init — must stay the first import
  config/sentry.js                init, scrubbing, capture, flush
  config/release.js               which build is running
  models/ErrorLog.js              the grouped record
  services/errorTracking.js       fingerprinting + the capture fan-out
  services/errorRetention.js      TTL, per tenant
  services/slowQuery.js           slow-query plugin (attached in db/registry.js)
  middleware/perf.js              slow-request monitor
  middleware/errorHandler.js      the 5xx hook
  controllers/errorController.js  triage API
  routes/errorRoutes.js           ingestion + triage routes

frontend/src/
  services/errorReporting.js      browser capture, dedupe, transport
  services/errorService.js        triage API client
  pages/ops/ErrorLogs.jsx         the screen

scripts/fetch-errors.mjs          pulls production errors into .errors/
backend/tests/errorTracking.test.js
```
