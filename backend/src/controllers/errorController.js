import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { ErrorLog } from '../models/ErrorLog.js';
import { captureClientError } from '../services/errorTracking.js';
import { audit } from '../utils/audit.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';
import { APP_RELEASE } from '../config/release.js';

// --- Ingestion (from the browser) -------------------------------------------

// Everything here is attacker-controlled: the endpoint has to be reachable
// without a session, because the crash worth hearing about most is the one on
// the login screen. So every field is bounded, and nothing is trusted to be
// what it claims — captureClientError rebuilds it into an Error rather than
// using it as one.
export const reportSchema = z.object({
  name: z.string().max(100).optional(),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(300).optional(),
  kind: z.enum(['error', 'slow']).optional(),
  // A small, free-form bag: the component that threw, the route, the failed
  // request's status. Bounded by the 1mb body limit and by the schema above it.
  extra: z.record(z.any()).optional(),
});

// POST /api/errors/report — unauthenticated by design; see routes/errorRoutes.js
// for the rate limit that makes that safe.
export const report = asyncHandler(async (req, res) => {
  await captureClientError(req.body, req);
  // 202: it has been accepted for recording, and the browser neither waits for
  // nor cares about the outcome. Returning the stored document would tell an
  // anonymous caller what else is broken in the hospital.
  res.status(202).json({ success: true, message: 'Reported', data: null });
});

// --- Triage (for whoever fixes it) ------------------------------------------

function buildFilter(query) {
  const filter = {};

  // Default is unresolved-only. The list exists to answer "what is broken now",
  // and a list that opens on every bug ever fixed answers a different question.
  if (query.status === 'resolved') filter.resolved = true;
  else if (query.status !== 'all') filter.resolved = false;

  if (query.source && query.source !== 'ALL') filter.source = query.source;
  if (query.kind && query.kind !== 'ALL') filter.kind = query.kind;
  if (query.release && query.release !== 'ALL') filter.release = query.release;

  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ message: rx }, { name: rx }, { route: rx }];
  }

  if (query.from || query.to) {
    filter.lastSeenAt = {};
    if (query.from) { const d = new Date(query.from); d.setHours(0, 0, 0, 0); filter.lastSeenAt.$gte = d; }
    if (query.to) { const d = new Date(query.to); d.setHours(23, 59, 59, 999); filter.lastSeenAt.$lte = d; }
  }

  return filter;
}

const SORTS = {
  // Newest first: what just started happening.
  recent: { lastSeenAt: -1 },
  // Loudest first: the most occurrences.
  frequency: { count: -1, lastSeenAt: -1 },
  // Widest first: the most DISTINCT people hit. Not the same question as
  // frequency — one automated retry loop can out-count an outage that is
  // stopping a whole ward from working.
  //
  // This one needs the length of an array, which find() cannot sort on, so the
  // list falls back to an aggregation for it. It used to be declared here as
  // { lastSeenAt: -1 }, which meant picking "most people affected" silently
  // sorted by recency instead.
  users: { affectedUserCount: -1, count: -1 },
};

// GET /api/errors?page&limit&status&source&kind&search&sort&from&to
export const list = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const filter = buildFilter(req.query);
  const sort = SORTS[req.query.sort] || SORTS.recent;

  // Sorting by distinct people needs the SIZE of affectedUsers, which find()
  // cannot express — so that one sort takes the aggregation path. Everything
  // else stays on the indexed find, which is the overwhelmingly common case.
  const byUsers = req.query.sort === 'users';

  const [items, total] = await Promise.all([
    byUsers
      ? ErrorLog.aggregate([
        { $match: filter },
        { $addFields: { affectedUserCount: { $size: { $ifNull: ['$affectedUsers', []] } } } },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { samples: 0, stack: 0 } },
      ])
      // The samples array and the full stack are the expensive fields and are
      // not read by a list — they load with the detail view.
      : ErrorLog.find(filter).select('-samples -stack').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    ErrorLog.countDocuments(filter),
  ]);

  sendSuccess(res, {
    message: 'Error groups',
    data: items.map((i) => ({ ...i, affectedUsers: i.affectedUsers?.length || 0 })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/errors/stats — the numbers on the page header.
//
// Every figure here answers a question somebody actually asks, and each is
// scoped to UNRESOLVED groups, because that is what "how are we doing" means.
// A count of every error ever recorded only goes up and tells you nothing.
export const stats = asyncHandler(async (_req, res) => {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000);

  const open = { resolved: false };

  const [
    openGroups, slowGroups, newToday, newYesterday,
    totals, people, regressions, inCurrentRelease, bySource, topRoutes, releases,
  ] = await Promise.all([
    ErrorLog.countDocuments({ ...open, kind: 'error' }),
    ErrorLog.countDocuments({ ...open, kind: 'slow' }),

    // "New" is by FIRST sighting, not last: an error that has been happening
    // for a week is not news today, however loud it is.
    ErrorLog.countDocuments({ ...open, firstSeenAt: { $gte: dayAgo } }),
    // The same window, one day earlier — the only way "12 new today" means
    // anything is next to what yesterday was.
    ErrorLog.countDocuments({ ...open, firstSeenAt: { $gte: twoDaysAgo, $lt: dayAgo } }),

    ErrorLog.aggregate([{ $match: open }, { $group: { _id: null, total: { $sum: '$count' } } }]),

    // Distinct signed-in accounts across all open groups. This is the number
    // that decides whether something is fixed today or this sprint — one
    // unlucky user is a ticket, forty is an incident.
    ErrorLog.aggregate([
      { $match: open },
      { $unwind: '$affectedUsers' },
      { $group: { _id: '$affectedUsers' } },
      { $count: 'total' },
    ]),

    // Fixes that did not hold. A rising number here means fixes are not being
    // verified, which is a different problem from the code getting worse.
    ErrorLog.countDocuments({ ...open, reopenCount: { $gt: 0 } }),

    // Still arriving from the build that is running right now — i.e. not
    // already fixed by something waiting to deploy.
    ErrorLog.countDocuments({ ...open, release: APP_RELEASE }),

    ErrorLog.aggregate([
      { $match: open },
      { $group: { _id: '$source', groups: { $sum: 1 }, occurrences: { $sum: '$count' } } },
    ]),

    // Worst offenders by endpoint, so the header can say WHERE as well as how
    // much. Grouped by route because five different errors on one broken
    // endpoint are one thing to go and look at.
    ErrorLog.aggregate([
      { $match: { ...open, route: { $ne: '' } } },
      {
        $group: {
          _id: { route: '$route', method: '$method' },
          groups: { $sum: 1 },
          occurrences: { $sum: '$count' },
        },
      },
      { $sort: { occurrences: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          route: '$_id.route',
          method: '$_id.method',
          groups: 1,
          occurrences: 1,
        },
      },
    ]),

    ErrorLog.distinct('release'),
  ]);

  const sourceOf = (name) => bySource.find((s) => s._id === name) || { groups: 0, occurrences: 0 };

  sendSuccess(res, {
    message: 'Error stats',
    data: {
      openGroups,
      slowGroups,
      newToday,
      newYesterday,
      occurrences: totals[0]?.total || 0,
      affectedUsers: people[0]?.total || 0,
      regressions,
      inCurrentRelease,
      bySource: { backend: sourceOf('backend'), frontend: sourceOf('frontend') },
      topRoutes,
      currentRelease: APP_RELEASE,
      releases: releases.filter(Boolean).sort(),
    },
  });
});

// GET /api/errors/export?format=csv|xlsx&<the same filters as the list>
//
// The list screen is for triage; this is for everything else — handing a
// sprint's worth of failures to whoever is planning the work, or attaching the
// evidence to a ticket. It honours the filters that are on screen, so what
// downloads is what you were looking at.
export const exportErrors = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  // The "users" sort is an aggregation-only field (see SORTS); on a plain find
  // it would name a path that does not exist and hand back arbitrary order.
  // Frequency answers the same question closely enough for a spreadsheet.
  const sort = req.query.sort === 'users'
    ? SORTS.frequency
    : SORTS[req.query.sort] || SORTS.recent;

  // Capped rather than unbounded: this builds the whole sheet in memory, and
  // nobody triages twenty thousand rows in a spreadsheet anyway.
  const items = await ErrorLog.find(filter).sort(sort).limit(5000).lean();

  const rows = items.map((e) => ({
    Error: e.name,
    Message: e.message,
    Source: e.source === 'frontend' ? 'Browser' : 'Server',
    Type: e.kind === 'slow' ? 'Slow' : 'Error',
    Method: e.method || '',
    Route: e.route || '',
    'HTTP status': e.statusCode || '',
    State: e.resolved ? 'Resolved' : 'Open',
    Occurrences: e.count,
    'People affected': e.affectedUsers?.length || 0,
    'First seen': e.firstSeenAt ? new Date(e.firstSeenAt).toISOString() : '',
    'Last seen': e.lastSeenAt ? new Date(e.lastSeenAt).toISOString() : '',
    Release: e.release || '',
    Environment: e.environment || '',
    'Resolved by': e.resolvedBy || '',
    'Times reopened': e.reopenCount || 0,
    // The one line that says which file to open. The full stack goes last,
    // because a spreadsheet with an 8KB cell in the middle is unreadable.
    'Top frame': topFrameOf(e.stack),
    Stack: e.stack || '',
  }));
  const name = `errors-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Errors');
  return sendCsv(res, name, rows);
});

// The first stack line pointing at our own code — the file and line somebody
// would actually open. Duplicated from services/errorTracking.js rather than
// exported from it, because that one works on a live Error while this one
// re-reads a stored string, and they are free to diverge.
function topFrameOf(stack = '') {
  for (const line of String(stack).split('\n').slice(1)) {
    if (line.includes('node_modules') || line.includes('node:internal')) continue;
    const m = line.match(/\(?([^()\s]+:\d+:\d+)\)?\s*$/);
    if (m) return m[1];
  }
  return '';
}

export const detail = asyncHandler(async (req, res) => {
  const item = await ErrorLog.findById(req.params.id).lean();
  if (!item) throw ApiError.notFound('Error group not found', 'ERROR_NOT_FOUND');
  sendSuccess(res, { message: 'Error group', data: item });
});

// PATCH /api/errors/:id/resolve — { resolved: boolean }
//
// Marking something resolved is a claim about a specific build, so the release
// it was made in is recorded alongside it. If the same fingerprint arrives
// again, the capture path clears the flag by itself — "we fixed that" and "it
// is still happening" must not both be true on the same row.
export const setResolved = asyncHandler(async (req, res) => {
  const resolved = req.body?.resolved !== false;

  const item = await ErrorLog.findByIdAndUpdate(
    req.params.id,
    resolved
      ? {
          $set: {
            resolved: true,
            resolvedAt: new Date(),
            resolvedBy: req.user?.name || '',
            resolvedInRelease: APP_RELEASE,
          },
        }
      : { $set: { resolved: false, resolvedAt: null, resolvedBy: '', resolvedInRelease: '' } },
    { new: true }
  ).select('-samples -stack');

  if (!item) throw ApiError.notFound('Error group not found', 'ERROR_NOT_FOUND');

  audit(req, {
    action: 'UPDATE',
    module: 'ErrorLog',
    recordId: String(item._id),
    description: `${resolved ? 'Resolved' : 'Reopened'} error: ${item.name} — ${item.message}`.slice(0, 300),
  });

  sendSuccess(res, { message: resolved ? 'Marked resolved' : 'Reopened', data: item });
});

// DELETE /api/errors/:id — for a group that is noise rather than a bug.
// Deliberately narrow: it removes one group, not a filtered sweep.
export const remove = asyncHandler(async (req, res) => {
  const item = await ErrorLog.findByIdAndDelete(req.params.id).select('name message');
  if (!item) throw ApiError.notFound('Error group not found', 'ERROR_NOT_FOUND');

  audit(req, {
    action: 'DELETE',
    module: 'ErrorLog',
    recordId: String(item._id),
    description: `Deleted error group: ${item.name} — ${item.message}`.slice(0, 300),
  });

  sendSuccess(res, { message: 'Error group deleted', data: null });
});
