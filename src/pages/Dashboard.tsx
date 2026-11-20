import { daysUntil, fmtDate, goalProgress, useStore } from '../store';
import { Progress } from '../components/ui';
import type { Page } from '../App';

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const { data } = useStore();
  const { profile, goals, skills, applications } = data;

  const activeGoals = goals.filter((g) => g.status === 'aktiv' || g.status === 'offen');
  const reached = goals.filter((g) => g.status === 'erreicht').length;
  const avgProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((s, g) => s + goalProgress(g), 0) / activeGoals.length)
    : 0;
  const openApps = applications.filter((a) => !['absage', 'idee'].includes(a.status)).length;
  const skillGap = skills.reduce((s, k) => s + Math.max(0, k.target - k.current), 0);

  type Item = { date: string; label: string; kind: string; page: Page };
  const upcoming: Item[] = [
    ...goals.flatMap((g) => [
      ...(g.targetDate && g.status !== 'erreicht' ? [{ date: g.targetDate, label: g.title, kind: 'Ziel', page: 'ziele' as Page }] : []),
      ...g.milestones
        .filter((m) => m.due && !m.done)
        .map((m) => ({ date: m.due!, label: `${m.title} · ${g.title}`, kind: 'Meilenstein', page: 'ziele' as Page })),
    ]),
    ...applications
      .filter((a) => a.nextStepDate && a.status !== 'absage')
      .map((a) => ({ date: a.nextStepDate!, label: `${a.nextStep || 'Nächster Schritt'} · ${a.company}`, kind: 'Bewerbung', page: 'bewerbungen' as Page })),
  ]
    .filter((i) => daysUntil(i.date) >= -7)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  const biggestGaps = [...skills].sort((a, b) => b.target - b.current - (a.target - a.current)).filter((s) => s.target > s.current).slice(0, 4);
  const isNew = !profile.name && !goals.length && !skills.length && !applications.length;

  return (
    <div className="page">
      <div className="hero">
        <p className="eyebrow">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{profile.name ? `Hallo ${profile.name.split(' ')[0]}!` : 'Willkommen im Karriereplaner'}</h1>
        {profile.currentRole || profile.targetRole ? (
          <div className="path">
            <span>{profile.currentRole || 'Heute'}</span>
            <span className="arrow">→</span>
            <strong>{profile.targetRole || 'Zielrolle festlegen'}</strong>
          </div>
        ) : (
          <p className="muted">Starte mit deiner Vision: Wo stehst du heute, wo willst du hin?</p>
        )}
        {profile.vision && <blockquote>„{profile.vision}“</blockquote>}
        {isNew && (
          <button className="btn primary" onClick={() => go('profil')}>Vision festlegen</button>
        )}
      </div>

      <div className="stats">
        <button className="stat" onClick={() => go('ziele')}>
          <span className="stat-num">{activeGoals.length}</span>
          <span className="stat-label">aktive Ziele</span>
          <Progress value={avgProgress} />
          <span className="stat-sub">⌀ {avgProgress}% Fortschritt · {reached} erreicht</span>
        </button>
        <button className="stat" onClick={() => go('skills')}>
          <span className="stat-num">{skills.length}</span>
          <span className="stat-label">Skills</span>
          <span className="stat-sub">{skillGap} Stufen bis zum Zielprofil</span>
        </button>
        <button className="stat" onClick={() => go('bewerbungen')}>
          <span className="stat-num">{openApps}</span>
          <span className="stat-label">laufende Bewerbungen</span>
          <span className="stat-sub">
            {applications.filter((a) => a.status === 'interview').length} im Interview ·{' '}
            {applications.filter((a) => a.status === 'angebot').length} Angebote
          </span>
        </button>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Als Nächstes</h2>
          {upcoming.length ? (
            <ul className="agenda">
              {upcoming.map((i, idx) => {
                const d = daysUntil(i.date);
                return (
                  <li key={idx} onClick={() => go(i.page)}>
                    <span className={`due ${d < 0 ? 'late' : d <= 7 ? 'soon' : ''}`}>
                      {d < 0 ? `${-d} T. über` : d === 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} T.`}
                    </span>
                    <span className="agenda-text">
                      <small>{i.kind} · {fmtDate(i.date)}</small>
                      {i.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Keine anstehenden Termine. Gib Zielen und Meilensteinen ein Datum.</p>
          )}
        </section>

        <section className="card">
          <h2>Größte Skill-Lücken</h2>
          {biggestGaps.length ? (
            <ul className="gaps">
              {biggestGaps.map((s) => (
                <li key={s.id}>
                  <span>{s.name}</span>
                  <span className="gap-bar">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <i key={n} className={n <= s.current ? 'have' : n <= s.target ? 'want' : ''} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Lege Skills mit Ist- und Zielniveau an, um Lücken zu sehen.</p>
          )}
        </section>
      </div>

      {activeGoals.length > 0 && (
        <section className="card">
          <h2>Ziele im Fokus</h2>
          <ul className="focus-goals">
            {activeGoals.slice(0, 5).map((g) => (
              <li key={g.id} onClick={() => go('ziele')}>
                <div className="row-between">
                  <span>{g.title}</span>
                  <small className="muted">{goalProgress(g)}%</small>
                </div>
                <Progress value={goalProgress(g)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
