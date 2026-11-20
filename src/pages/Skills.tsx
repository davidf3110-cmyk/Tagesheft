import { useState } from 'react';
import { removeById, uid, upsert, useStore } from '../store';
import { Empty, Field, LevelPicker, Modal, PageHead } from '../components/ui';
import type { Skill } from '../types';

const LEVELS = ['', 'Grundlagen', 'Anwendung', 'Fortgeschritten', 'Experte', 'Meister'];
const newSkill = (): Skill => ({ id: uid(), name: '', category: 'Fachlich', current: 1, target: 3, plan: '' });

export default function Skills() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<Skill | null>(null);
  const save = (s: Skill) => update((d) => ({ ...d, skills: upsert(d.skills, s) }));
  const categories = [...new Set(data.skills.map((s) => s.category))].sort();

  return (
    <div className="page">
      <PageHead title="Skills" sub="Ist-Stand vs. Zielniveau – wo lohnt sich Lernen am meisten?"
        action={<button className="btn primary" onClick={() => setEditing(newSkill())}>+ Skill</button>} />

      <div className="legend small muted">
        <span><i className="have" /> aktuell</span>
        <span><i className="want" /> Ziel</span>
      </div>

      {!data.skills.length ? (
        <Empty icon="🧠" text="Welche Fähigkeiten brauchst du für deine Zielrolle?"
          action={<button className="btn primary" onClick={() => setEditing(newSkill())}>Ersten Skill anlegen</button>} />
      ) : (
        categories.map((cat) => (
          <section key={cat} className="card">
            <h2>{cat}</h2>
            <ul className="skill-list">
              {data.skills.filter((s) => s.category === cat)
                .sort((a, b) => b.target - b.current - (a.target - a.current))
                .map((s) => (
                  <li key={s.id} onClick={() => setEditing(s)}>
                    <div className="skill-main">
                      <strong>{s.name}</strong>
                      <small className="muted">{LEVELS[s.current]} → {LEVELS[s.target]}</small>
                      {s.plan && <small className="plan">📌 {s.plan}</small>}
                    </div>
                    <span className="gap-bar big">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <i key={n} className={n <= s.current ? 'have' : n <= s.target ? 'want' : ''} />
                      ))}
                    </span>
                    <div className="skill-quick" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" aria-label="Niveau senken" disabled={s.current <= 1} onClick={() => save({ ...s, current: s.current - 1 })}>−</button>
                      <button className="icon-btn" aria-label="Niveau erhöhen" disabled={s.current >= 5} onClick={() => save({ ...s, current: s.current + 1 })}>+</button>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <SkillEditor skill={editing} categories={categories} isNew={!data.skills.some((s) => s.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(s) => { save(s); setEditing(null); }}
          onDelete={() => { update((d) => ({ ...d, skills: removeById(d.skills, editing.id) })); setEditing(null); }} />
      )}
    </div>
  );
}

function SkillEditor({ skill, categories, isNew, onClose, onSave, onDelete }: {
  skill: Skill; categories: string[]; isNew: boolean; onClose: () => void; onSave: (s: Skill) => void; onDelete: () => void;
}) {
  const [s, setS] = useState(skill);
  const set = (p: Partial<Skill>) => setS((x) => ({ ...x, ...p }));
  const cats = [...new Set(['Fachlich', 'Methodisch', 'Sozial', 'Führung', 'Sprachen', ...categories])];
  return (
    <Modal title={isNew ? 'Neuer Skill' : 'Skill bearbeiten'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (s.name.trim()) onSave(s); }}>
        <div className="form-row">
          <Field label="Skill"><input autoFocus required value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Projektmanagement" /></Field>
          <Field label="Kategorie">
            <input list="skill-cats" value={s.category} onChange={(e) => set({ category: e.target.value })} />
            <datalist id="skill-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Field label={`Aktuell: ${LEVELS[s.current]}`}><LevelPicker label="aktuelles Niveau" value={s.current} onChange={(current) => set({ current })} /></Field>
        <Field label={`Ziel: ${LEVELS[s.target]}`}><LevelPicker label="Zielniveau" value={s.target} onChange={(target) => set({ target })} /></Field>
        <Field label="Lernplan (Kurs, Buch, Projekt …)">
          <textarea rows={2} value={s.plan} onChange={(e) => set({ plan: e.target.value })} />
        </Field>
        <footer className="modal-foot">
          {!isNew && <button type="button" className="btn danger" onClick={() => confirm('Skill löschen?') && onDelete()}>Löschen</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary">Speichern</button>
        </footer>
      </form>
    </Modal>
  );
}
