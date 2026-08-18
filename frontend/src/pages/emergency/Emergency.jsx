import { useCallback, useEffect, useState } from 'react';
import { Siren, UserPlus, Stethoscope, ShieldAlert, LogOut, Timer } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getQueue, getErStats, triageScale as fetchScale } from '../../services/emergencyService.js';
import ArrivalModal from './ArrivalModal.jsx';
import TriageModal from './TriageModal.jsx';
import DispositionModal from './DispositionModal.jsx';
import MlcModal from './MlcModal.jsx';

// The board refreshes on a timer because casualty is the one screen nobody has
// a spare hand to reload. Thirty seconds is short enough that a new arrival
// appears while the nurse is still walking back to the desk.
const REFRESH_MS = 30_000;

// Acuity colours are clinical shorthand, not decoration — red/orange/yellow/
// green/blue mean the same thing in every emergency department, so they are
// used literally rather than mapped onto the app's monochrome palette.
const LEVEL_STYLE = {
  1: 'bg-red-600 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-400 text-black',
  4: 'bg-green-600 text-white',
  5: 'bg-blue-600 text-white',
};

function TriageBadge({ level, scale }) {
  if (!level) {
    return (
      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-dashed border-border px-2 text-xs font-semibold text-muted">
        —
      </span>
    );
  }
  const meta = scale.find((s) => s.level === level);
  return (
    <span
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-bold ${LEVEL_STYLE[level] || ''}`}
      title={meta ? `${meta.label} · seen within ${meta.targetMinutes} min` : ''}
    >
      {level}
    </span>
  );
}

// How long they have waited, and whether that is already past the target for
// their acuity. A number on its own does not tell a charge nurse anything; a
// number that turns red when it breaches does.
function WaitCell({ visit, scale }) {
  const target = scale.find((s) => s.level === visit.triageLevel)?.targetMinutes;
  const waited = visit.waitingMinutes ?? 0;
  const seen = !!visit.firstSeenAt;
  const breached = !seen && target !== undefined && waited > target;

  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${breached ? 'font-semibold text-red-600' : 'text-muted'}`}>
      {breached && <Timer className="h-3.5 w-3.5" />}
      {waited}m
      {seen && <span className="text-xs">· seen at {visit.doorToDoctorMinutes}m</span>}
    </span>
  );
}

export default function Emergency() {
  const { can } = useAuth();
  const toast = useToast();

  const [scale, setScale] = useState([]);
  const [queue, setQueue] = useState(null);
  const [stats, setStats] = useState(null);

  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [triageFor, setTriageFor] = useState(null);
  const [disposeFor, setDisposeFor] = useState(null);
  const [mlcFor, setMlcFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const [q, s] = await Promise.all([getQueue(), getErStats()]);
      setQueue(q);
      setStats(s);
    } catch (e) {
      toast.error(e.message);
      setQueue([]);
    }
  }, [toast]);

  useEffect(() => { fetchScale().then(setScale).catch(() => setScale([])); }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!queue) return <ListSkeleton card />;

  const live = stats?.live;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Siren className="h-5 w-5" /> Casualty
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ordered by acuity, then by how long they have waited. Untriaged patients come first.
          </p>
        </div>
        {can('emergency:register') && (
          <Button onClick={() => setArrivalOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Register arrival
          </Button>
        )}
      </div>

      {live && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Waiting', live.waiting],
            ['In treatment', live.inTreatment],
            ['Observation', live.observation],
            ['Triage compliance', stats.overallCompliancePercent === null ? '—' : `${stats.overallCompliancePercent}%`],
          ].map(([label, value]) => (
            <Card key={label} className="!p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {queue.length === 0 ? (
        <Card>
          <EmptyState icon={Siren} title="Casualty is clear" description="No patients waiting or in treatment." />
        </Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-3 font-medium">Acuity</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Complaint</th>
                  <th className="px-4 py-3 font-medium">Waiting</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((v) => (
                  <tr key={v._id || v.id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                    <td className="px-3 py-3"><TriageBadge level={v.triageLevel} scale={scale} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{v.displayName}</span>
                        {!v.patient && <Badge tone="warning">Unidentified</Badge>}
                        {v.isMLC && <Badge tone="danger">MLC</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {v.erNo}{v.patient?.uhid ? ` · ${v.patient.uhid}` : ''} · {v.arrivalMode?.replace('_', ' ').toLowerCase()}
                      </p>
                    </td>
                    <td className="px-4 py-3">{v.chiefComplaint}</td>
                    <td className="px-4 py-3"><WaitCell visit={v} scale={scale} /></td>
                    <td className="px-4 py-3">
                      <Badge tone={v.status === 'WAITING' ? 'warning' : 'neutral'}>
                        {v.status.replace('_', ' ')}
                      </Badge>
                      {v.attendingDoctor && (
                        <p className="mt-0.5 text-xs text-muted">
                          Dr. {[v.attendingDoctor.firstName, v.attendingDoctor.lastName].filter(Boolean).join(' ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {can('emergency:triage') && (
                          <button onClick={() => setTriageFor(v)} className="btn-ghost h-8 px-2 text-xs" title="Triage / re-triage">
                            {v.triageLevel ? 'Re-triage' : 'Triage'}
                          </button>
                        )}
                        {can('emergency:mlc') && (
                          <button onClick={() => setMlcFor(v)} className="btn-ghost h-8 w-8 !p-0" title="Medico-legal">
                            <ShieldAlert className="h-4 w-4" />
                          </button>
                        )}
                        {can('emergency:treat') && (
                          <button onClick={() => setDisposeFor(v)} className="btn-ghost h-8 w-8 !p-0" title="Close visit">
                            <LogOut className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Door-to-doctor, per acuity. A department can have a good average wait
          and still be failing its sickest patients, which is why this is broken
          out rather than shown as one number. */}
      {stats?.doorToDoctor?.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Stethoscope className="h-4 w-4" /> Door-to-doctor by acuity
          </h2>
          <div className="mt-3 space-y-2">
            {stats.doorToDoctor.map((r) => (
              <div key={r.level} className="flex items-center gap-3 text-sm">
                <TriageBadge level={r.level} scale={scale} />
                <span className="w-28 shrink-0 text-muted">{r.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className={`h-full ${r.compliancePercent >= 90 ? 'bg-green-600' : r.compliancePercent >= 70 ? 'bg-yellow-400' : 'bg-red-600'}`}
                    style={{ width: `${r.compliancePercent}%` }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right tabular-nums text-muted">
                  {r.compliancePercent}% within {r.targetMinutes}m
                </span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
                  avg {r.avgMinutes}m · n={r.seen}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ArrivalModal open={arrivalOpen} scale={scale} onClose={() => setArrivalOpen(false)} onSaved={load} />
      <TriageModal visit={triageFor} scale={scale} onClose={() => setTriageFor(null)} onSaved={load} />
      <DispositionModal visit={disposeFor} onClose={() => setDisposeFor(null)} onSaved={load} />
      <MlcModal visit={mlcFor} onClose={() => setMlcFor(null)} onSaved={load} />
    </div>
  );
}
