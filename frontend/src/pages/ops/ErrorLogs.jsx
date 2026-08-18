import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Bug, Search, CheckCircle2, RotateCcw, Trash2, Timer, Users,
  Monitor, Server, Download, TrendingUp, TrendingDown, Minus, Flame,
} from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  listErrors, getErrorStats, getError, setErrorResolved, deleteError, exportErrors,
} from '../../services/errorService.js';
import { formatDateTime } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';

// What broke on the live server, grouped.
//
// The list is deliberately of GROUPS, not occurrences: one row per distinct
// failure with a count beside it. A screen that lists every occurrence of a
// broken endpoint shows the same bug four hundred times and gets closed.

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'frequency', label: 'Most occurrences' },
  { value: 'users', label: 'Most people affected' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Unresolved' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

const SOURCE_OPTIONS = [
  { value: 'ALL', label: 'Everywhere' },
  { value: 'backend', label: 'Server' },
  { value: 'frontend', label: 'Browser' },
];

const KIND_OPTIONS = [
  { value: 'ALL', label: 'Errors & slow' },
  { value: 'error', label: 'Errors only' },
  { value: 'slow', label: 'Slow only' },
];

const RANGE_PRESETS = [
  { key: 'all', label: 'All time', all: true },
  { key: '24h', label: 'Last 24h', days: 1 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
];

const toISODate = (d) => d.toISOString().slice(0, 10);
function computePreset(preset) {
  if (preset.all) return { from: '', to: '' };
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - preset.days);
  return { from: toISODate(from), to: toISODate(now) };
}

// How loud a failure is, by how many times it happened. Colour is doing real
// work here — it separates "one person, once" from "everyone, all afternoon"
// at a glance.
function severityTone(count) {
  if (count >= 100) return 'danger';
  if (count >= 10) return 'warning';
  return 'neutral';
}

// A KPI tile.
//
// `onClick` is what turns the header from a read-only scoreboard into
// navigation: seeing "4 slow endpoints" and then having to work out which
// filter shows them is the step that made people give up on the number.
function Stat({ icon: Icon, label, value, hint, tone = 'neutral', onClick, active }) {
  const TONES = {
    neutral: 'text-muted',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    good: 'text-green-600 dark:text-green-400',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'card p-4 text-left transition-colors',
        onClick && 'hover:border-fg/25 hover:bg-surface',
        !onClick && 'cursor-default',
        active && 'border-fg/40 bg-surface'
      )}
    >
      <div className={cn('flex items-center gap-2', TONES[tone])}>
        <Icon className="h-4 w-4 shrink-0" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </button>
  );
}

// "12 new today" on its own is not information — 12 against yesterday's 30 is
// a system recovering, and against yesterday's 2 it is an incident.
function Trend({ today, yesterday }) {
  const delta = today - yesterday;
  if (yesterday === 0 && today === 0) return <>none yesterday either</>;
  if (delta === 0) return <><Minus className="mr-1 inline h-3 w-3" />same as yesterday</>;
  const worse = delta > 0;
  return (
    <span className={worse ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
      {worse ? <TrendingUp className="mr-1 inline h-3 w-3" /> : <TrendingDown className="mr-1 inline h-3 w-3" />}
      {worse ? '+' : ''}{delta} vs yesterday
    </span>
  );
}

function DetailModal({ id, onClose, onChanged, canManage }) {
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getError(id)
      .then(setItem)
      .catch((err) => toast.error(err.message || 'Could not load that error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const toggleResolved = async () => {
    setBusy(true);
    try {
      const updated = await setErrorResolved(id, !item.resolved);
      setItem({ ...item, resolved: updated.resolved });
      onChanged();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={item ? item.name : 'Error'}>
      {loading || !item ? (
        <ListSkeleton />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="break-words font-medium">{item.message}</p>

          {item.reopenCount > 0 && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              Marked fixed and came back {item.reopenCount} time{item.reopenCount === 1 ? '' : 's'}.
              Whatever was changed did not address this.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-muted">Occurrences</p><p className="mt-0.5 tabular-nums">{item.count}</p></div>
            <div><p className="text-xs text-muted">People affected</p><p className="mt-0.5 tabular-nums">{item.affectedUsers?.length || 0}</p></div>
            <div><p className="text-xs text-muted">First seen</p><p className="mt-0.5">{formatDateTime(item.firstSeenAt)}</p></div>
            <div><p className="text-xs text-muted">Last seen</p><p className="mt-0.5">{formatDateTime(item.lastSeenAt)}</p></div>
            <div><p className="text-xs text-muted">Where</p><p className="mt-0.5 font-mono text-xs">{item.method} {item.route || '—'}</p></div>
            <div><p className="text-xs text-muted">Status code</p><p className="mt-0.5 tabular-nums">{item.statusCode || '—'}</p></div>
            <div><p className="text-xs text-muted">Release</p><p className="mt-0.5 font-mono text-xs">{item.release || '—'}</p></div>
            <div><p className="text-xs text-muted">Environment</p><p className="mt-0.5">{item.environment || '—'}</p></div>
          </div>

          {/* The stack is the whole point of the screen — it is what turns
              "billing is broken" into a file and a line number. */}
          {item.stack && (
            <div>
              <p className="mb-1 text-xs text-muted">Stack trace</p>
              <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
                {item.stack}
              </pre>
            </div>
          )}

          {/* Recent occurrences: who hit it and on which screen. This answers
              "can I reproduce it" — the same user every time is a data problem,
              everyone is a code problem. */}
          {item.samples?.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted">Last {item.samples.length} occurrence(s)</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">URL</th>
                      <th className="px-3 py-2 font-medium">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.samples.map((s, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(s.at)}</td>
                        <td className="px-3 py-2">{s.userName || 'Signed out'}{s.userRole ? ` · ${s.userRole}` : ''}</td>
                        <td className="px-3 py-2 font-mono">{s.url || '—'}</td>
                        {/* Paste this into the server logs to find the exact
                            request, and into the audit trail to find what the
                            user was doing. */}
                        <td className="px-3 py-2 font-mono text-muted">{s.requestId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {item.sentryEventId && (
            <p className="text-xs text-muted">
              Sentry event <span className="font-mono">{item.sentryEventId}</span> — open it there for
              breadcrumbs and the full trace.
            </p>
          )}

          {canManage && (
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" loading={busy} onClick={toggleResolved}>
                {item.resolved
                  ? <><RotateCcw className="h-4 w-4" /> Reopen</>
                  : <><CheckCircle2 className="h-4 w-4" /> Mark resolved</>}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function ErrorLogs() {
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can('errors:manage');

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 25 } });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('open');
  const [source, setSource] = useState('ALL');
  const [kind, setKind] = useState('ALL');
  const [release, setRelease] = useState('ALL');
  const [sort, setSort] = useState('recent');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exporting, setExporting] = useState(null);
  const debounceRef = useRef();

  // One object, so the list and the export can never drift apart — what
  // downloads is exactly what is on screen.
  const query = {
    status, source, kind, sort, search,
    release: release === 'ALL' ? undefined : release,
    from: from || undefined,
    to: to || undefined,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listErrors({ ...query, page, limit: 25 }));
    } catch (err) {
      toast.error(err.message || 'Failed to load errors');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, source, kind, release, sort, search, from, to, toast]);

  const fetchStats = useCallback(() => {
    getErrorStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const refresh = () => { fetchData(); fetchStats(); };

  const onSearch = (e) => {
    const v = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  };

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    const { from: f, to: t } = computePreset(preset);
    setFrom(f); setTo(t); setPage(1);
  };

  // Clicking a KPI narrows the list to what that number counted.
  const focus = (next) => {
    setPage(1);
    setStatus(next.status ?? 'open');
    setKind(next.kind ?? 'ALL');
    setSource(next.source ?? 'ALL');
    setSort(next.sort ?? 'recent');
  };

  const onExport = async (format) => {
    setExporting(format);
    try {
      await exportErrors(query, format);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const onToggleResolved = async (item) => {
    try {
      await setErrorResolved(item._id || item.id, !item.resolved);
      toast.success(item.resolved ? 'Reopened' : 'Marked resolved');
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const onDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteError(deleting._id || deleting.id);
      toast.success('Deleted');
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  const { items, pagination } = data;
  const releaseOptions = [
    { value: 'ALL', label: 'Any release' },
    ...(stats?.releases || []).map((r) => ({
      value: r,
      label: r === stats?.currentRelease ? `${r} (running)` : r,
    })),
  ];

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Error Tracking</h1>
          <p className="mt-0.5 text-sm text-muted">
            What broke on the live server, grouped by cause
            {stats?.currentRelease ? <> · running <span className="font-mono">{stats.currentRelease}</span></> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}>
            <Download className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Stat
              icon={Bug}
              label="Open issues"
              value={stats.openGroups}
              tone={stats.openGroups > 0 ? 'warning' : 'good'}
              hint={`${stats.inCurrentRelease} still in the running build`}
              onClick={() => focus({ kind: 'error' })}
              active={status === 'open' && kind === 'error'}
            />
            <Stat
              icon={Users}
              label="People affected"
              value={stats.affectedUsers}
              tone={stats.affectedUsers > 0 ? 'warning' : 'good'}
              hint="distinct signed-in accounts"
              onClick={() => focus({ sort: 'users' })}
              active={sort === 'users'}
            />
            <Stat
              icon={Flame}
              label="Occurrences"
              value={stats.occurrences}
              hint={<Trend today={stats.newToday} yesterday={stats.newYesterday} />}
              onClick={() => focus({ sort: 'frequency' })}
              active={sort === 'frequency'}
            />
            <Stat
              icon={RotateCcw}
              label="Regressions"
              value={stats.regressions}
              tone={stats.regressions > 0 ? 'danger' : 'good'}
              hint="fixes that came back"
            />
            <Stat
              icon={Timer}
              label="Slow endpoints"
              value={stats.slowGroups}
              tone={stats.slowGroups > 0 ? 'warning' : 'good'}
              hint="over the threshold"
              onClick={() => focus({ kind: 'slow' })}
              active={kind === 'slow'}
            />
          </div>

          {/* Where the failures are coming from, and which endpoints are worst.
              Both are one click away from being the list's filter — the point
              of a summary is to lead somewhere. */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Where it breaks</p>
              <div className="mt-3 space-y-2">
                {[
                  { key: 'backend', label: 'Server', icon: Server, s: stats.bySource?.backend },
                  { key: 'frontend', label: 'Browser', icon: Monitor, s: stats.bySource?.frontend },
                ].map(({ key, label, icon: Icon, s }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setPage(1); setSource(source === key ? 'ALL' : key); }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                      source === key ? 'border-fg/40 bg-surface' : 'border-border hover:bg-surface'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted" /> {label}
                    </span>
                    <span className="tabular-nums text-muted">
                      {s?.groups || 0} issue{(s?.groups || 0) === 1 ? '' : 's'} · {s?.occurrences || 0}×
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card p-4 lg:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Worst endpoints</p>
              {stats.topRoutes?.length ? (
                <div className="mt-3 space-y-1.5">
                  {stats.topRoutes.map((r) => (
                    <button
                      key={`${r.method}${r.route}`}
                      type="button"
                      onClick={() => { setPage(1); setSearch(r.route); }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface"
                    >
                      <span className="truncate font-mono text-xs">
                        <span className="text-muted">{r.method}</span> {r.route}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted">
                        {r.groups} issue{r.groups === 1 ? '' : 's'} · {r.occurrences}×
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">Nothing recorded against a route yet.</p>
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-9"
              placeholder="Search message, type or route…"
              onChange={onSearch}
              defaultValue={search}
              key={search}
            />
          </div>
          <div className="w-full sm:w-36"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_OPTIONS} /></div>
          <div className="w-full sm:w-32"><Select value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }} options={SOURCE_OPTIONS} /></div>
          <div className="w-full sm:w-36"><Select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} options={KIND_OPTIONS} /></div>
          <div className="w-full sm:w-40"><Select value={release} onChange={(e) => { setPage(1); setRelease(e.target.value); }} options={releaseOptions} /></div>
          <div className="w-full sm:w-48"><Select value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }} options={SORT_OPTIONS} /></div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  activePreset === p.key ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:bg-surface hover:text-fg'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <div className="w-36"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActivePreset('custom'); setPage(1); }} /></div>
            <div className="w-36"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActivePreset('custom'); setPage(1); }} /></div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState
            icon={Bug}
            title="Nothing broken"
            description={
              status === 'open'
                ? 'No unresolved errors match these filters. New ones appear here within seconds of happening.'
                : 'No errors match these filters.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Error</th>
                    <th className="px-4 py-3 font-medium">Where</th>
                    <th className="px-4 py-3 font-medium">Count</th>
                    <th className="px-4 py-3 font-medium">People</th>
                    <th className="px-4 py-3 font-medium">Last seen</th>
                    <th className="px-4 py-3 font-medium">Release</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const id = e._id || e.id;
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="max-w-[320px] px-4 py-3">
                          <button onClick={() => setViewing(id)} className="text-left hover:underline">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              {e.source === 'frontend'
                                ? <Monitor className="h-3.5 w-3.5 shrink-0 text-muted" />
                                : <Server className="h-3.5 w-3.5 shrink-0 text-muted" />}
                              {e.name}
                              {e.kind === 'slow' && <Badge tone="warning">slow</Badge>}
                              {/* A fix that did not hold is a different problem
                                  from a new bug, and worth spotting in the list. */}
                              {e.reopenCount > 0 && <Badge tone="danger">regression</Badge>}
                              {e.resolved && <Badge tone="success">resolved</Badge>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted">{e.message}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">{e.method} {e.route || '—'}</td>
                        <td className="px-4 py-3"><Badge tone={severityTone(e.count)}>{e.count}</Badge></td>
                        <td className="px-4 py-3 tabular-nums text-muted">{e.affectedUsers || 0}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(e.lastSeenAt)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">
                          {e.release || '—'}
                          {e.release && e.release === stats?.currentRelease && (
                            <span className="ml-1 text-[10px] uppercase text-amber-600 dark:text-amber-400">live</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canManage && (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => onToggleResolved(e)}
                                className="btn-ghost h-8 w-8 !p-0"
                                title={e.resolved ? 'Reopen' : 'Mark resolved'}
                              >
                                {e.resolved ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                              </button>
                              <button onClick={() => setDeleting(e)} className="btn-ghost h-8 w-8 !p-0" title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onChange={setPage}
            />
          </>
        )}
      </div>

      <DetailModal id={viewing} onClose={() => setViewing(null)} onChanged={refresh} canManage={canManage} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={deleteBusy}
        title="Delete this error group?"
        message="The group and its samples are removed. If the same error happens again it comes back as a new group."
        confirmLabel="Delete"
      />
    </div>
  );
}
