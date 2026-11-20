import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppData } from './types';

const KEY = 'karriereplaner:data';

export const emptyData = (): AppData => ({
  version: 1,
  profile: { name: '', currentRole: '', targetRole: '', vision: '', values: [], strengths: [] },
  goals: [],
  skills: [],
  applications: [],
  journal: [],
});

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => new Date().toISOString().slice(0, 10);

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    /* ignorieren */
  }
  return emptyData();
}

export function isAppData(x: unknown): x is AppData {
  const d = x as AppData;
  return !!d && typeof d === 'object' && Array.isArray(d.goals) && Array.isArray(d.skills) && !!d.profile;
}

type Updater = (fn: (d: AppData) => AppData) => void;
const Ctx = createContext<{ data: AppData; update: Updater; replace: (d: AppData) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* Speicher voll oder blockiert */
    }
  }, [data]);
  const update: Updater = (fn) => setData((d) => fn(d));
  const replace = (d: AppData) => setData({ ...emptyData(), ...d });
  return <Ctx.Provider value={{ data, update, replace }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider fehlt');
  return c;
}

/** Hilfsfunktionen für Listen-Updates */
export function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}
export const removeById = <T extends { id: string }>(list: T[], id: string) => list.filter((x) => x.id !== id);

export function goalProgress(g: { milestones: { done: boolean }[]; status: string }) {
  if (g.status === 'erreicht') return 100;
  if (!g.milestones.length) return 0;
  return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
}

export const fmtDate = (s?: string) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export function daysUntil(s: string) {
  const d = new Date(s + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime();
  return Math.round(d / 86400000);
}
