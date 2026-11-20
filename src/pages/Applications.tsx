import { useState } from 'react';
import { fmtDate, removeById, today, uid, upsert, useStore } from '../store';
import { Empty, Field, Modal, PageHead } from '../components/ui';
import type { Application, ApplicationStatus } from '../types';

export const APP_STATUS: { key: ApplicationStatus; label: string }[] = [
  { key: 'idee', label: 'Merkliste' },
  { key: 'beworben', label: 'Beworben' },
  { key: 'interview', label: 'Interview' },
  { key: 'angebot', label: 'Angebot' },
  { key: 'absage', label: 'Abgeschlossen' },
];

const newApp = (status: ApplicationStatus = 'idee'): Application => ({
  id: uid(), company: '', position: '', status, notes: '',
  appliedOn: status === 'beworben' ? today() : undefined,
});

export default function Applications() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<Application | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const save = (a: Application) => update((d) => ({ ...d, applications: upsert(d.applications, a) }));
  const move = (a: Application, status: ApplicationStatus) =>
    save({ ...a, status, appliedOn: status === 'beworben' && !a.appliedOn ? today() : a.appliedOn });

  return (
    <div className="page">
      <PageHead title="Bewerbungen" sub="Pipeline von der Merkliste bis zum Angebot. Karten per Drag & Drop verschieben."
        action={<button className="btn primary" onClick={() => setEditing(newApp())}>+ Bewerbung</button>} />

      {!data.applications.length ? (
        <Empty icon="📨" text="Behalte alle Bewerbungen, Gespräche und nächsten Schritte im Blick."
          action={<button className="btn primary" onClick={() => setEditing(newApp())}>Erste Stelle merken</button>} />
      ) : (
        <div className="kanban">
          {APP_STATUS.map((col, ci) => {
            const list = data.applications.filter((a) => a.status === col.key);
            return (
              <section key={col.key} className={`kanban-col col-${col.key}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { const a = data.applications.find((x) => x.id === dragId); if (a) move(a, col.key); setDragId(null); }}>
                <header className="column-head">
                  <h2>{col.label}</h2>
                  <span className="count">{list.length}</span>
                </header>
                {list.map((a) => (
                  <article key={a.id} className="app-card card" draggable onDragStart={() => setDragId(a.id)} onClick={() => setEditing(a)}>
                    <strong>{a.company || 'Unternehmen'}</strong>
                    <span className="small">{a.position}</span>
                    {a.appliedOn && <small className="muted">beworben {fmtDate(a.appliedOn)}</small>}
                    {a.nextStep && <small className="next">➜ {a.nextStep}{a.nextStepDate ? ` · ${fmtDate(a.nextStepDate)}` : ''}</small>}
                    <div className="move" onClick={(e) => e.stopPropagation()}>
                      {ci > 0 && <button className="icon-btn" aria-label="zurück" onClick={() => move(a, APP_STATUS[ci - 1].key)}>←</button>}
                      {ci < APP_STATUS.length - 1 && <button className="icon-btn" aria-label="weiter" onClick={() => move(a, APP_STATUS[ci + 1].key)}>→</button>}
                    </div>
                  </article>
                ))}
                <button className="add-inline" onClick={() => setEditing(newApp(col.key))}>+ Hinzufügen</button>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <AppEditor app={editing} isNew={!data.applications.some((a) => a.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(a) => { save(a); setEditing(null); }}
          onDelete={() => { update((d) => ({ ...d, applications: removeById(d.applications, editing.id) })); setEditing(null); }} />
      )}
    </div>
  );
}

function AppEditor({ app, isNew, onClose, onSave, onDelete }: {
  app: Application; isNew: boolean; onClose: () => void; onSave: (a: Application) => void; onDelete: () => void;
}) {
  const [a, setA] = useState(app);
  const set = (p: Partial<Application>) => setA((x) => ({ ...x, ...p }));
  return (
    <Modal title={isNew ? 'Neue Bewerbung' : a.company || 'Bewerbung'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (a.company.trim()) onSave(a); }}>
        <div className="form-row">
          <Field label="Unternehmen"><input autoFocus required value={a.company} onChange={(e) => set({ company: e.target.value })} /></Field>
          <Field label="Position"><input value={a.position} onChange={(e) => set({ position: e.target.value })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Status">
            <select value={a.status} onChange={(e) => set({ status: e.target.value as ApplicationStatus })}>
              {APP_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Beworben am"><input type="date" value={a.appliedOn || ''} onChange={(e) => set({ appliedOn: e.target.value || undefined })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Nächster Schritt"><input value={a.nextStep || ''} onChange={(e) => set({ nextStep: e.target.value })} placeholder="z. B. Zweitgespräch" /></Field>
          <Field label="Datum"><input type="date" value={a.nextStepDate || ''} onChange={(e) => set({ nextStepDate: e.target.value || undefined })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Link zur Stelle"><input type="url" value={a.link || ''} onChange={(e) => set({ link: e.target.value })} placeholder="https://" /></Field>
          <Field label="Gehalt / Wunsch"><input value={a.salary || ''} onChange={(e) => set({ salary: e.target.value })} /></Field>
        </div>
        {a.link && <a className="small" href={a.link} target="_blank" rel="noreferrer">Stellenanzeige öffnen ↗</a>}
        <Field label="Notizen (Ansprechpartner, Eindrücke, Fragen …)">
          <textarea rows={4} value={a.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <footer className="modal-foot">
          {!isNew && <button type="button" className="btn danger" onClick={() => confirm('Bewerbung löschen?') && onDelete()}>Löschen</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary">Speichern</button>
        </footer>
      </form>
    </Modal>
  );
}
