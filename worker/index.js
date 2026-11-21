// Tagesheft – Backend auf Cloudflare Workers
// Speichert alle Daten als Dokumente (Sammlung + ID + JSON) in D1.
// Alle /api-Aufrufe brauchen den Zugangscode (Secret APP_TOKEN) als Bearer-Token.

import { calendarEvents } from './ical.js';
import { serveStatic } from './static.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const NAME = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

function authorized(req, env) {
  const h = req.headers.get('authorization') || '';
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  const want = env.APP_TOKEN || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// Fortlaufender Zeitstempel: nie kleiner als der letzte vergebene, damit kein Sync etwas verpasst.
async function stamp(env) {
  const row = await env.DB.prepare('SELECT MAX(u) AS m FROM docs').first();
  return Math.max(Date.now(), (row && row.m ? row.m : 0) + 1);
}

async function writeDoc(env, c, id, d, u) {
  if (d == null) {
    await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,NULL,?3) ON CONFLICT(c,id) DO UPDATE SET d=NULL,u=?3')
      .bind(c, id, u).run();
  } else {
    await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,?3,?4) ON CONFLICT(c,id) DO UPDATE SET d=?3,u=?4')
      .bind(c, id, JSON.stringify(d), u).run();
  }
}

export async function getDoc(env, c, id) {
  const r = await env.DB.prepare('SELECT d FROM docs WHERE c=?1 AND id=?2').bind(c, id).first();
  return r && r.d ? JSON.parse(r.d) : null;
}

export async function listDocs(env, c) {
  const { results } = await env.DB.prepare('SELECT id, d FROM docs WHERE c=?1 AND d IS NOT NULL').bind(c).all();
  return results.map((r) => [r.id, JSON.parse(r.d)]);
}

async function api(req, env, url) {
  const p = url.pathname;

  if (p === '/api/ping') return json({ ok: true });
  if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401);

  // Alle Änderungen seit einem Zeitpunkt (ms). since=0 liefert alles.
  if (p === '/api/sync' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0) || 0;
    const { results } = await env.DB.prepare('SELECT c, id, d, u FROM docs WHERE u > ?1 ORDER BY u').bind(since).all();
    const max = results.reduce((m, r) => Math.max(m, r.u), since);
    return json({
      cursor: max,
      docs: results.map((r) => ({ c: r.c, id: r.id, d: r.d == null ? null : JSON.parse(r.d), u: r.u })),
    });
  }

  // Ein Dokument schreiben (d = null löscht es).
  if (p === '/api/doc' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b || !NAME.test(b.c || '') || !NAME.test(b.id || '')) return json({ error: 'invalid_argument' }, 400);
    if (b.d != null && (typeof b.d !== 'object' || Array.isArray(b.d))) return json({ error: 'invalid_argument' }, 400);
    const body = b.d == null ? null : JSON.stringify(b.d);
    if (body && body.length > 900_000) return json({ error: 'quota_exceeded' }, 413);
    const u = await stamp(env);
    await writeDoc(env, b.c, b.id, b.d, u);
    return json({ ok: true, u });
  }

  // Viele Dokumente auf einmal (Import, Automationen).
  if (p === '/api/batch' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.docs)) return json({ error: 'invalid_argument' }, 400);
    let u = await stamp(env);
    const stmts = [];
    for (const x of b.docs) {
      if (!NAME.test(x.c || '') || !NAME.test(x.id || '')) return json({ error: 'invalid_argument', doc: x.id }, 400);
      stmts.push(
        x.d == null
          ? env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,NULL,?3) ON CONFLICT(c,id) DO UPDATE SET d=NULL,u=?3').bind(x.c, x.id, u++)
          : env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,?3,?4) ON CONFLICT(c,id) DO UPDATE SET d=?3,u=?4').bind(x.c, x.id, JSON.stringify(x.d), u++)
      );
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return json({ ok: true, n: stmts.length });
  }

  // Ein Dokument lesen (für Automationen).
  if (p === '/api/doc' && req.method === 'GET') {
    const c = url.searchParams.get('c'), id = url.searchParams.get('id');
    if (!NAME.test(c || '') || !NAME.test(id || '')) return json({ error: 'invalid_argument' }, 400);
    return json({ d: await getDoc(env, c, id) });
  }

  // Termine aus dem privaten iCal-Link (settings/kalender.ics).
  if (p === '/api/cal' && req.method === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return json({ error: 'invalid_argument' }, 400);
    const cfg = await getDoc(env, 'settings', 'kalender');
    const ics = (cfg && cfg.ics) || env.CAL_ICS;
    if (!ics) return json({ error: 'no_calendar' }, 404);
    try {
      const events = await calendarEvents(ics, from, to);
      return json({ events });
    } catch (e) {
      return json({ error: 'calendar_failed', message: String(e && e.message || e).slice(0, 200) }, 502);
    }
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return json({ error: 'internal', message: String(e && e.message || e).slice(0, 300) }, 500);
      }
    }
    return serveStatic(url);
  },
};
