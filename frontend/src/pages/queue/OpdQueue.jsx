import { useCallback, useEffect, useState } from 'react';
import { ListOrdered, Plus, PhoneCall, Play, Check, SkipForward, Monitor } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeDoctors } from '../../services/doctorService.js';
import {
  doctorQueue, queueStats, callNext, callToken, startConsultation, completeToken, skipToken,
} from '../../services/queueService.js';
import IssueTokenModal from './IssueTokenModal.jsx';
import DisplayBoard from './DisplayBoard.jsx';

// The queue moves without anybody reloading it — a receptionist watching the
// list has no spare hand for a refresh button.
const REFRESH_MS = 20_000;

const PRIORITY_TONE = {
  EMERGENCY_REFERRAL: 'danger',
  SENIOR_CITIZEN: 'warning',
  DISABILITY: 'warning',
  PREGNANCY: 'warning',
  INFANT: 'warning',
};

function TokenRow({ token, canCall, onAction }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
      <span className="w-20 shrink-0 font-mono text-sm font-semibold">{token.tokenLabel}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {[token.patient?.firstName, token.patient?.lastName].filter(Boolean).join(' ')}
        </p>
        <p className="text-xs text-muted">
          {token.patient?.uhid} · {token.type === 'WALK_IN' ? 'walk-in' : 'booked'} · waiting {token.waitingMinutes}m
        </p>
      </div>

      {token.priority !== 'NONE' && (
        <Badge tone={PRIORITY_TONE[token.priority] || 'neutral'}>
          {token.priority.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      )}

      {canCall && (
        <div className="flex gap-1">
          {token.status === 'WAITING' && (
            <button onClick={() => onAction('call', token)} className="btn-ghost h-8 w-8 !p-0" title="Call">
              <PhoneCall className="h-4 w-4" />
            </button>
          )}
          {['WAITING', 'CALLED'].includes(token.status) && (
            <>
              <button onClick={() => onAction('start', token)} className="btn-ghost h-8 w-8 !p-0" title="Start consultation">
                <Play className="h-4 w-4" />
              </button>
              <button onClick={() => onAction('skip', token)} className="btn-ghost h-8 w-8 !p-0" title="No response">
                <SkipForward className="h-4 w-4" />
              </button>
            </>
          )}
          {token.status === 'IN_CONSULTATION' && (
            <button onClick={() => onAction('complete', token)} className="btn-ghost h-8 w-8 !p-0" title="Complete">
              <Check className="h-4 w-4" />
            </button>
          )}
          {token.status === 'SKIPPED' && (
            <button onClick={() => onAction('call', token)} className="btn-ghost h-8 px-2 text-xs" title="Recall">
              Recall
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function OpdQueue() {
  const { can } = useAuth();
  const toast = useToast();

  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [queue, setQueue] = useState(null);
  const [stats, setStats] = useState(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  useEffect(() => {
    activeDoctors()
      .then((list) => {
        setDoctors(list);
        setDoctorId((current) => current || String(list[0]?.id || list[0]?._id || ''));
      })
      .catch(() => setDoctors([]));
  }, []);

  const load = useCallback(async () => {
    if (!doctorId) return;
    try {
      const [q, s] = await Promise.all([doctorQueue(doctorId), queueStats()]);
      setQueue(q); setStats(s);
    } catch (e) { toast.error(e.message); setQueue(null); }
  }, [doctorId, toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action, token) => {
    const id = token._id || token.id;
    try {
      if (action === 'call') await callToken(id);
      if (action === 'start') await startConsultation(id);
      if (action === 'complete') await completeToken(id);
      if (action === 'skip') await skipToken(id, 'No response when called');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const next = async () => {
    try {
      const token = await callNext(doctorId);
      toast.success(`Calling ${token.tokenLabel}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ListOrdered className="h-5 w-5" /> OPD Queue
          </h1>
          <p className="mt-1 text-sm text-muted">
            Priority first, then token number — the order patients are actually seen in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-56"
            placeholder="Select doctor"
            options={doctors.map((d) => ({
              value: String(d.id || d._id),
              label: `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`,
            }))} />
          <Button variant="outline" onClick={() => setBoardOpen(true)}>
            <Monitor className="mr-1.5 h-4 w-4" /> Board
          </Button>
          {can('queue:issue') && (
            <Button onClick={() => setIssueOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Issue token
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Waiting', stats.waiting],
            ['Completed today', stats.completed],
            // Split on purpose: a long wait with short consultations is a
            // scheduling problem, a long wait with long ones is a capacity
            // problem, and one combined number hides which.
            ['Avg wait', stats.avgWaitMinutes === null ? '—' : `${stats.avgWaitMinutes}m`],
            ['Avg consultation', stats.avgConsultationMinutes === null ? '—' : `${stats.avgConsultationMinutes}m`],
          ].map(([label, value]) => (
            <Card key={label} className="!p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {!queue ? <ListSkeleton card /> : (
        <>
          {(queue.nowServing || queue.called) && (
            <Card className="!p-4">
              <p className="text-xs text-muted">{queue.nowServing ? 'In consultation' : 'Called'}</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="font-mono text-2xl font-bold">
                  {(queue.nowServing || queue.called).tokenLabel}
                </span>
                <span className="text-sm">
                  {[(queue.nowServing || queue.called).patient?.firstName,
                    (queue.nowServing || queue.called).patient?.lastName].filter(Boolean).join(' ')}
                </span>
              </div>
            </Card>
          )}

          <Card className="!p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Waiting · {queue.counts.waiting}</h2>
              {can('queue:call') && queue.counts.waiting > 0 && (
                <Button size="sm" onClick={next}>
                  <PhoneCall className="mr-1.5 h-4 w-4" /> Call next
                </Button>
              )}
            </div>

            {queue.waiting.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={ListOrdered} title="Nobody waiting" description="The queue is clear for this doctor." />
              </div>
            ) : (
              queue.waiting.map((t) => (
                <TokenRow key={t._id} token={t} canCall={can('queue:call')} onAction={act} />
              ))
            )}
          </Card>

          {queue.done.length > 0 && (
            <Card className="!p-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
                Seen today · {queue.counts.completed}
                {queue.counts.skipped > 0 && <span className="ml-2 text-xs text-muted">({queue.counts.skipped} skipped)</span>}
              </h2>
              {queue.done.slice(0, 15).map((t) => (
                <div key={t._id} className="flex items-center gap-3 border-b border-border/60 px-4 py-2 last:border-0">
                  <span className="w-20 shrink-0 font-mono text-sm">{t.tokenLabel}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {[t.patient?.firstName, t.patient?.lastName].filter(Boolean).join(' ')}
                  </span>
                  <Badge tone={t.status === 'COMPLETED' ? 'success' : 'neutral'}>
                    {t.status.toLowerCase()}
                  </Badge>
                  {t.consultationMinutes !== null && (
                    <span className="text-xs tabular-nums text-muted">{t.consultationMinutes}m</span>
                  )}
                  {can('queue:call') && t.status === 'SKIPPED' && (
                    <button onClick={() => act('call', t)} className="btn-ghost h-7 px-2 text-xs">Recall</button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      <IssueTokenModal open={issueOpen} doctors={doctors} defaultDoctor={doctorId}
        onClose={() => setIssueOpen(false)} onSaved={load} />
      <DisplayBoard open={boardOpen} onClose={() => setBoardOpen(false)} />
    </div>
  );
}
