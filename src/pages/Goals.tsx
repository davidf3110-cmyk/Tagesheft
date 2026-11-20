import { useState } from 'react';
import { daysUntil, fmtDate, goalProgress, removeById, today, uid, upsert, useStore } from '../store';
import { Empty, Field, Modal, PageHead, Progress } from '../components/ui';
import type { Goal, GoalStatus, Horizon } from '../types';

const HORIZONS: { key: Horizon; label: string; hint: string }[] = [
  { key: 'kurz', label: 'Kurzfristig', hint: '< 6 Monate' },
  { key: 'mittel', label: 'Mittelfristig', hint: '6–24 Monate' },
  { key: 'lang', label: 'Langfristig', hint: '2+ Jahre' },
];
const STATUS: GoalStatus[] = ['offen', 'aktiv', 'pausiert', 'erreicht'];
const CATEGORIES = ['Rolle & Position', 'Weiterbildung', 'Netzwerk', 'Gehalt', 'Projekte', 'Work-Life-Balance', 'Sonstiges'];

const newGoal = (horizon: Horizon = 'mittel'): Goal => ({
  id: uid(),
  title: '',
  description: '',
  category: CATEGORIES[0],
  horizon,
  status: 'aktiv',
  milestones: [],
  createdAt: today(),
});

export default function Goals() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<'alle' | GoalStatus>('alle');

  const save = (g: Goal) => update((d) => ({ ...d, goals: upsert(d.goals, g) }));
  const toggleMilestone = (g: Goal, mid: string) =>
    save({ ...g, milestones: g.milestones.map((m) => (m.id === mid ? { ...m, done: !m.done } : m)) });

  const goals = data.goals.filter((g) => filter === 'alle' || g.status === filter);

  return (
    <div className="page">
      <PageHead
        title="Ziele"
        sub="Teile große Ziele in überprüfbare Meilensteine."
        action={<button className="btn primary" onClick={() => setEditing(newGoal())}>+ Ziel</button>}
      />
      <div className="chips">
        {(['alle', ...STATUS] as const).map((s) => (
          <button key={s} className={`chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {!data.goals.length ? (
        <Empty icon="🎯" text="Noch keine Ziele. Was willst du in den nächsten Monaten erreichen?"
          action={<button className="btn primary" onClick={() => setEditing(newGoal())}>Erstes Ziel anlegen</button>} />
      ) : (
        <div className="columns">
          {HORIZONS.map((h) => {
            const list = goals.filter((g) => g.horizon === h.key);
            return (
              <section key={h.key} className="column">
                <header className="column-head">
                  <h2>{h.label}</h2>
                  <small className="muted">{h.hint}</small>
                </header>
                {list.map((g) => {
                  const p = goalProgress(g);
                  const d = g.targetDate ? daysUntil(g.targetDate) : null;
                  return (
                    <article key={g.id} className={`goal card status-${g.status}`}>
                      <div className="row-between">
                        <span className="badge">{g.category}</span>
                        <span className={`status-pill ${g.status}`}>{g.status}</span>
                      </div>
                      <h3 onClick={() => setEditing(g)}>{g.title || 'Ohne Titel'}</h3>
                      {g.description && <p className="muted small">{g.description}</p>}
                      <Progress value={p} />
                      <div className="row-between small muted">
                        <span>{p}%</span>
                        {g.targetDate && (
                          <span className={d! < 0 && g.status !== 'erreicht' ? 'late' : ''}>bis {fmtDate(g.targetDate)}</span>
                        )}
                      </div>
                      {g.milestones.length > 0 && (
                        <ul className="checklist">
                          {g.milestones.map((m) => (
                            <li key={m.id}>
                              <label>
                                <input type="checkbox" checked={m.done} onChange={() => toggleMilestone(g, m.id)} />
                                <span className={m.done ? 'done' : ''}>{m.title}</span>
                              </label>
                              {m.due && <small className="muted">{fmtDate(m.due)}</small>}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button className="btn ghost small" onClick={() => setEditing(g)}>Bearbeiten</button>
                    </article>
                  );
                })}
                <button className="add-inline" onClick={() => setEditing(newGoal(h.key))}>+ {h.label}es Ziel</button>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <GoalEditor
          goal={editing}
          isNew={!data.goals.some((g) => g.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(g) => { save(g); setEditing(null); }}
          onDelete={() => { update((d) => ({ ...d, goals: removeById(d.goals, editing.id) })); setEditing(null); }}
        />
      )}
    </div>
  );
}

function GoalEditor({ goal, isNew, onClose, onSave, onDelete }: {
  goal: Goal; isNew: boolean; onClose: () => void; onSave: (g: Goal) => void; onDelete: () => void;
}) {
  const [g, setG] = useState(goal);
  const [ms, setMs] = useState('');
  const set = (patch: Partial<Goal>) => setG((x) => ({ ...x, ...patch }));
  const addMs = () => {
    if (!ms.trim()) return;
    set({ milestones: [...g.milestones, { id: uid(), title: ms.trim(), done: false }] });
    setMs('');
  };

  return (
    <Modal title={isNew ? 'Neues Ziel' : 'Ziel bearbeiten'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (g.title.trim()) onSave(g); }}>
        <Field label="Titel">
          <input autoFocus required value={g.title} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Zertifizierung als Scrum Master" />
        </Field>
        <Field label="Beschreibung / Warum ist mir das wichtig?">
          <textarea rows={2} value={g.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="form-row">
          <Field label="Kategorie">
            <select value={g.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Zeithorizont">
            <select value={g.horizon} onChange={(e) => set({ horizon: e.target.value as Horizon })}>
              {HORIZONS.map((h) => <option key={h.key} value={h.key}>{h.label} ({h.hint})</option>)}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Status">
            <select value={g.status} onChange={(e) => set({ status: e.target.value as GoalStatus })}>
              {STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Zieldatum">
            <input type="date" value={g.targetDate || ''} onChange={(e) => set({ targetDate: e.target.value || undefined })} />
          </Field>
        </div>

        <div className="field">
          <span>Meilensteine</span>
          <ul className="ms-edit">
            {g.milestones.map((m, i) => (
              <li key={m.id}>
                <input type="checkbox" checked={m.done} aria-label="erledigt"
                  onChange={() => set({ milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} />
                <input value={m.title} aria-label="Meilenstein"
                  onChange={(e) => set({ milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })} />
                <input type="date" value={m.due || ''} aria-label="Fällig"
                  onChange={(e) => set({ milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, due: e.target.value || undefined } : x)) })} />
                <button type="button" className="icon-btn" aria-label="nach oben" disabled={i === 0}
                  onClick={() => { const a = [...g.milestones]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ milestones: a }); }}>↑</button>
                <button type="button" className="icon-btn" aria-label="entfernen"
                  onClick={() => set({ milestones: g.milestones.filter((x) => x.id !== m.id) })}>✕</button>
              </li>
            ))}
          </ul>
          <div className="inline-add">
            <input value={ms} onChange={(e) => setMs(e.target.value)} placeholder="Neuer Meilenstein"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMs(); } }} />
            <button type="button" className="btn" onClick={addMs}>Hinzufügen</button>
          </div>
        </div>

        <footer className="modal-foot">
          {!isNew && <button type="button" className="btn danger" onClick={() => confirm('Ziel löschen?') && onDelete()}>Löschen</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary">Speichern</button>
        </footer>
      </form>
    </Modal>
  );
}
