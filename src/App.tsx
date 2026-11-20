import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Goals from './pages/Goals';
import Skills from './pages/Skills';
import Applications from './pages/Applications';
import Journal from './pages/Journal';
import Settings from './pages/Settings';

export type Page = 'start' | 'profil' | 'ziele' | 'skills' | 'bewerbungen' | 'reflexion' | 'daten';

const NAV: { key: Page; label: string; icon: string; mobile?: boolean }[] = [
  { key: 'start', label: 'Übersicht', icon: '🏠', mobile: true },
  { key: 'ziele', label: 'Ziele', icon: '🎯', mobile: true },
  { key: 'skills', label: 'Skills', icon: '🧠', mobile: true },
  { key: 'bewerbungen', label: 'Bewerbungen', icon: '📨', mobile: true },
  { key: 'reflexion', label: 'Reflexion', icon: '📓' },
  { key: 'profil', label: 'Vision', icon: '🧭' },
  { key: 'daten', label: 'Daten', icon: '💾' },
];

const fromHash = (): Page => {
  const h = location.hash.slice(1) as Page;
  return NAV.some((n) => n.key === h) ? h : 'start';
};

export default function App() {
  const [page, setPage] = useState<Page>(fromHash);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const h = () => setPage(fromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const go = (p: Page) => {
    location.hash = p;
    setMore(false);
    window.scrollTo(0, 0);
  };

  const View = {
    start: () => <Dashboard go={go} />,
    profil: Profile,
    ziele: Goals,
    skills: Skills,
    bewerbungen: Applications,
    reflexion: Journal,
    daten: Settings,
  }[page];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="icon.svg" alt="" width={28} height={28} />
          <span>Karriereplaner</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.key} className={page === n.key ? 'active' : ''} onClick={() => go(n.key)}>
              <span aria-hidden>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
      </aside>

      <main>
        <View />
      </main>

      <nav className="tabbar">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.key} className={page === n.key ? 'active' : ''} onClick={() => go(n.key)}>
            <span aria-hidden>{n.icon}</span>
            <small>{n.label}</small>
          </button>
        ))}
        <button className={!NAV.find((n) => n.key === page)?.mobile ? 'active' : ''} onClick={() => setMore((m) => !m)}>
          <span aria-hidden>☰</span>
          <small>Mehr</small>
        </button>
      </nav>
      {more && (
        <div className="more-sheet" onClick={() => setMore(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            {NAV.filter((n) => !n.mobile).map((n) => (
              <button key={n.key} onClick={() => go(n.key)}>
                <span aria-hidden>{n.icon}</span> {n.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
