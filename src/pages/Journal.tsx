import { useState } from 'react';
import { fmtDate, removeById, today, uid, useStore } from '../store';
import { Empty, PageHead } from '../components/ui';

const MOODS = ['', '😞', '😕', '😐', '🙂', '🤩'];
const PROMPTS = [
  'Was habe ich diese Woche gelernt?',
  'Worauf bin ich stolz?',
  'Was hat mir Energie geraubt – und warum?',
  'Welches Feedback habe ich bekommen?',
  'Was ist mein wichtigster Schritt für nächste Woche?',
];

export default function Journal() {
  const { data, update } = useStore();
  const [text, setText] = useState('');
  const [mood, setMood] = useState(4);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  const add = () => {
    if (!text.trim()) return;
    update((d) => ({ ...d, journal: [{ id: uid(), date: today(), text: text.trim(), mood }, ...d.journal] }));
    setText('');
  };

  return (
    <div className="page">
      <PageHead title="Reflexion" sub="Kurze, regelmäßige Notizen machen Fortschritt sichtbar – und helfen beim nächsten Mitarbeitergespräch." />
      <section className="card form">
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={prompt} aria-label="Eintrag" />
        <div className="row-between">
          <div className="moods" role="radiogroup" aria-label="Stimmung">
            {MOODS.slice(1).map((m, i) => (
              <button key={i} type="button" role="radio" aria-checked={mood === i + 1} className={mood === i + 1 ? 'on' : ''} onClick={() => setMood(i + 1)}>{m}</button>
            ))}
          </div>
          <button className="btn primary" onClick={add} disabled={!text.trim()}>Speichern</button>
        </div>
      </section>

      {!data.journal.length ? (
        <Empty icon="📓" text="Noch keine Einträge." />
      ) : (
        <ul className="journal">
          {data.journal.map((j) => (
            <li key={j.id} className="card">
              <div className="row-between">
                <small className="muted">{MOODS[j.mood]} {fmtDate(j.date)}</small>
                <button className="icon-btn" aria-label="Eintrag löschen"
                  onClick={() => confirm('Eintrag löschen?') && update((d) => ({ ...d, journal: removeById(d.journal, j.id) }))}>✕</button>
              </div>
              <p className="prewrap">{j.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
