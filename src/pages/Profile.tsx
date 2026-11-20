import { useStore } from '../store';
import { Field, PageHead, TagInput } from '../components/ui';
import type { Profile as P } from '../types';

export default function Profile() {
  const { data, update } = useStore();
  const p = data.profile;
  const set = (patch: Partial<P>) => update((d) => ({ ...d, profile: { ...d.profile, ...patch } }));

  return (
    <div className="page">
      <PageHead title="Vision & Profil" sub="Dein Nordstern – alles andere leitet sich davon ab. Änderungen werden automatisch gespeichert." />
      <section className="card form">
        <Field label="Name">
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Vorname Nachname" />
        </Field>
        <div className="form-row">
          <Field label="Aktuelle Rolle">
            <input value={p.currentRole} onChange={(e) => set({ currentRole: e.target.value })} placeholder="z. B. Junior Entwickler:in" />
          </Field>
          <Field label="Zielrolle">
            <input value={p.targetRole} onChange={(e) => set({ targetRole: e.target.value })} placeholder="z. B. Tech Lead" />
          </Field>
        </div>
        <Field label="Meine Vision in 5 Jahren">
          <textarea
            rows={4}
            value={p.vision}
            onChange={(e) => set({ vision: e.target.value })}
            placeholder="Wie sieht dein Arbeitsalltag aus? Woran arbeitest du, mit wem, mit welchem Einfluss?"
          />
        </Field>
        <Field label="Werte (Enter zum Hinzufügen)">
          <TagInput value={p.values} onChange={(values) => set({ values })} placeholder="z. B. Autonomie, Lernen, Wirkung" />
        </Field>
        <Field label="Stärken">
          <TagInput value={p.strengths} onChange={(strengths) => set({ strengths })} placeholder="z. B. Kommunikation, Analyse" />
        </Field>
      </section>
    </div>
  );
}
