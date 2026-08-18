import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Lock, PenLine } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listNotes, addNote, signNote, amendNote } from '../../services/clinicalService.js';

const NOTE_TYPES = [
  { value: 'PROGRESS', label: 'Progress note' },
  { value: 'NURSING', label: 'Nursing note' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'HANDOVER', label: 'Handover' },
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'DISCHARGE', label: 'Discharge summary' },
];

const TYPE_LABEL = Object.fromEntries(NOTE_TYPES.map((t) => [t.value, t.label]));

const fmt = (d) => new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function ComposeModal({ open, encounter, patient, encounterType, onClose, onSaved }) {
  const toast = useToast();
  const [noteType, setNoteType] = useState('PROGRESS');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNoteType('PROGRESS'); setBody(''); } }, [open]);

  const submit = async (sign) => {
    if (body.trim().length < 2) { toast.error('The note needs some content'); return; }
    setSaving(true);
    try {
      await addNote({ patient, encounterType, encounter, noteType, body: body.trim(), sign });
      toast.success(sign ? 'Note signed' : 'Draft saved'); onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New note"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="outline" onClick={() => submit(false)} disabled={saving}>Save draft</Button>
        <Button onClick={() => submit(true)} loading={saving}>Sign &amp; file</Button>
      </>}>
      <div className="space-y-4">
        <Select label="Type" value={noteType} onChange={(e) => setNoteType(e.target.value)} options={NOTE_TYPES} />
        <div>
          <label className="label">Note</label>
          <textarea rows={10} className="input resize-y font-mono text-sm" value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Findings, impression, plan…" />
        </div>
        <p className="text-xs text-muted">
          A signed note becomes part of the record and cannot be rewritten — corrections go in as an
          addendum. Save a draft if you want to come back to it.
        </p>
      </div>
    </Modal>
  );
}

function AmendModal({ note, onClose, onSaved }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setBody(note?.isSigned ? '' : (note?.body || '')); }, [note]);

  const submit = async (e) => {
    e.preventDefault();
    if (body.trim().length < 2) { toast.error('Nothing to save'); return; }
    setSaving(true);
    try {
      await amendNote(note._id || note.id, body.trim());
      toast.success(note.isSigned ? 'Addendum added' : 'Draft updated');
      onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!note} onClose={onClose} size="lg"
      title={note?.isSigned ? 'Add an addendum' : 'Edit draft'}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="amend-f" loading={saving}>Save</Button></>}>
      <form id="amend-f" onSubmit={submit} className="space-y-3">
        {note?.isSigned && (
          <>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="mb-1 text-xs font-medium text-muted">Original, unchanged</p>
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
            </div>
            <p className="text-xs text-muted">
              A signed note stays exactly as written. Your correction is appended below it, with your
              name and the time — which is what makes the record evidence of what was known when.
            </p>
          </>
        )}
        <div>
          <label className="label">{note?.isSigned ? 'Addendum' : 'Note'}</label>
          <textarea rows={8} className="input resize-y font-mono text-sm" value={body}
            onChange={(e) => setBody(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

export default function ClinicalNotes({ encounter, patient, encounterType = 'IPD' }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [composeOpen, setComposeOpen] = useState(false);
  const [amending, setAmending] = useState(null);

  const load = useCallback(async () => {
    try { setNotes(await listNotes(encounter, filter === 'ALL' ? {} : { noteType: filter })); }
    catch (e) { toast.error(e.message); setNotes([]); }
  }, [encounter, filter, toast]);

  useEffect(() => { load(); }, [load]);

  const sign = async (note) => {
    try { await signNote(note._id || note.id); toast.success('Note signed'); load(); }
    catch (e) { toast.error(e.message); }
  };

  if (!notes) return <ListSkeleton />;

  const isMine = (note) => String(note.author?._id || note.author) === String(user?.id || user?._id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Notes
        </h3>
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}
            options={[{ value: 'ALL', label: 'All types' }, ...NOTE_TYPES]} className="w-44" />
          {can('clinical:note') && (
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New note
            </Button>
          )}
        </div>
      </div>

      {notes.length === 0 ? (
        <Card><EmptyState icon={FileText} title="No notes yet" description="Nothing has been written on this admission." /></Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note._id || note.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{TYPE_LABEL[note.noteType] || note.noteType}</Badge>
                  <span className="text-sm font-medium">{note.author?.name || 'Unknown'}</span>
                  <span className="text-xs text-muted">{note.authorRole}</span>
                  <span className="text-xs text-muted">· {fmt(note.authoredAt)}</span>
                  {note.isSigned
                    ? <Badge tone="success"><Lock className="mr-1 inline h-3 w-3" />Signed</Badge>
                    : <Badge tone="warning">Draft</Badge>}
                </div>
                {can('clinical:note') && (
                  <div className="flex gap-1">
                    {!note.isSigned && isMine(note) && (
                      <button onClick={() => sign(note)} className="btn-ghost h-7 px-2 text-xs">Sign</button>
                    )}
                    <button onClick={() => setAmending(note)} className="btn-ghost h-7 px-2 text-xs">
                      <PenLine className="mr-1 inline h-3 w-3" />
                      {note.isSigned ? 'Addendum' : 'Edit'}
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm">{note.body}</p>

              {note.addenda?.length > 0 && (
                <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
                  {note.addenda.map((a, i) => (
                    <div key={i}>
                      <p className="text-xs text-muted">
                        Addendum · {a.author?.name || 'Unknown'} · {fmt(a.at)}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{a.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <ComposeModal open={composeOpen} encounter={encounter} patient={patient} encounterType={encounterType}
        onClose={() => setComposeOpen(false)} onSaved={load} />
      <AmendModal note={amending} onClose={() => setAmending(null)} onSaved={load} />
    </div>
  );
}
