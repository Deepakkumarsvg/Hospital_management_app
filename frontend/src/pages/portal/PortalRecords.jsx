import { useEffect, useState } from 'react';
import { FileText, FlaskConical, Scan, FileDown } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { cn } from '../../utils/cn.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getPortalPrescriptions, getPortalLabOrders, getPortalRadOrders, downloadPortalPrescriptionPdf,
} from '../../services/portalService.js';
import { OPD_STATUS_META, LAB_STATUS_META, RAD_STATUS_META, formatDate } from '../../utils/constants.js';

const TABS = [
  { key: 'prescriptions', label: 'Prescriptions', icon: FileText },
  { key: 'lab', label: 'Lab Reports', icon: FlaskConical },
  { key: 'radiology', label: 'Radiology', icon: Scan },
];

export default function PortalRecords() {
  const toast = useToast();
  const [tab, setTab] = useState('prescriptions');
  const [data, setData] = useState({ prescriptions: null, lab: null, radiology: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data[tab] !== null) return;
    setLoading(true);
    const fetcher = { prescriptions: getPortalPrescriptions, lab: getPortalLabOrders, radiology: getPortalRadOrders }[tab];
    fetcher()
      .then((res) => setData((d) => ({ ...d, [tab]: res })))
      .catch((e) => toast.error(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tab, data, toast]);

  const rows = data[tab];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">My Records</h1>
        <p className="mt-0.5 text-sm text-muted">Prescriptions, lab and radiology reports.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading || rows === null ? <Spinner full /> : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Nothing here yet" description="Your records will appear here after your visits." />
      ) : tab === 'prescriptions' ? (
        <div className="space-y-3">
          {rows.map((v) => {
            const meta = OPD_STATUS_META[v.status] || {};
            return (
              <Card key={v.id} className="!p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Dr. {v.doctor?.firstName} {v.doctor?.lastName}</p>
                      <Badge tone={meta.tone}>{meta.label || v.status}</Badge>
                      <span className="font-mono text-xs text-muted">{v.visitNo}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {v.department?.name} · {formatDate(v.visitDate)}
                      {v.diagnosis ? ` · ${v.diagnosis}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">{(v.prescription || []).length} medicine(s) prescribed</p>
                  </div>
                  <Button variant="outline" className="shrink-0"
                    onClick={() => downloadPortalPrescriptionPdf(v.id, v.visitNo).catch((e) => toast.error(e.message || 'PDF failed'))}>
                    <FileDown className="h-4 w-4" /> PDF
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((o) => {
            const metaMap = tab === 'lab' ? LAB_STATUS_META : RAD_STATUS_META;
            const meta = metaMap[o.status] || {};
            return (
              <Card key={o.id} className="!p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{o.testName || (o.items?.length ? `${o.items.length} test(s)` : 'Order')}</p>
                  <Badge tone={meta.tone}>{meta.label || o.status}</Badge>
                  <span className="font-mono text-xs text-muted">{o.orderNo}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {o.doctor ? `Dr. ${o.doctor.firstName} ${o.doctor.lastName} · ` : ''}{formatDate(o.createdAt)}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
