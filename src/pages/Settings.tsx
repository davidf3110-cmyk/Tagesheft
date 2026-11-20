import { useRef, useState } from 'react';
import { emptyData, isAppData, today, useStore } from '../store';
import { PageHead } from '../components/ui';

export default function Settings() {
  const { data, replace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `karriereplaner-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text());
      if (!isAppData(parsed)) throw new Error();
      if (confirm('Aktuelle Daten durch die Sicherung ersetzen?')) {
        replace(parsed);
        setMsg('Sicherung importiert.');
      }
    } catch {
      setMsg('Die Datei ist keine gültige Karriereplaner-Sicherung.');
    }
  };

  return (
    <div className="page">
      <PageHead title="Daten" sub="Alles bleibt auf diesem Gerät gespeichert – kein Konto, keine Cloud." />
      <section className="card">
        <h2>Sicherung</h2>
        <p className="muted small">Exportiere regelmäßig eine Sicherung, um Daten auf ein anderes Gerät zu übertragen oder vor Verlust zu schützen.</p>
        <div className="btn-row">
          <button className="btn primary" onClick={exportData}>Exportieren (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importieren …</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
        </div>
        {msg && <p className="small">{msg}</p>}
      </section>
      <section className="card">
        <h2>Zurücksetzen</h2>
        <p className="muted small">Löscht alle Ziele, Skills, Bewerbungen und Notizen auf diesem Gerät.</p>
        <button className="btn danger" onClick={() => confirm('Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.') && replace(emptyData())}>
          Alle Daten löschen
        </button>
      </section>
    </div>
  );
}
