// Tagesheft – Backend auf Cloudflare Workers
// Speichert alle Daten als Dokumente (Sammlung + ID + JSON) in D1.
// Alle /api-Aufrufe brauchen den Zugangscode (Secret APP_TOKEN) als Bearer-Token.

import { calendarEvents } from './ical.js';
import { speech, probe, gkey, voices, voiceOf, checkKey, speakOnce } from './tts.js';
import { serveStatic } from './static.js';
import { mcp } from './mcp.js';
import { briefing, geocode, reverseGeocode, todayLocal } from './ai.js';

const mp3 = (buf) => new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'content-disposition': 'inline; filename="james.mp3"', 'cache-control': 'no-store', 'content-length': String(buf.byteLength) } });
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
  // Der Wecker-Kurzbefehl darf nur das Briefing abrufen, mit eigenem Code (?k=).
  let weck = false;
  const wkKey = url.searchParams.get('k');
  if ((p === '/api/briefing' || p === '/api/briefing.mp3' || p === '/api/stimme/probe' || p === '/api/briefing/demo') && wkKey) {
    const r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('weckcode').first();
    weck = !!(r && r.v && r.v.length === wkKey.length && r.v === wkKey);
  }
  if (!weck && !authorized(req, env)) return json({ error: 'unauthorized' }, 401);

  if (p === '/api/mcp/code' && req.method === 'GET') {
    if (weck) return json({ error: 'unauthorized' }, 401);
    let r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('mcpcode').first();
    if (!r) {
      const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(32));
      const v = Array.from(b, (x) => a[x % a.length]).join('');
      await env.DB.prepare('INSERT INTO secrets (k,v) VALUES (?1,?2)').bind('mcpcode', v).run();
      r = { v };
    }
    return json({ url: url.origin + '/mcp/' + r.v });
  }

  if (p === '/api/wecker/code' && req.method === 'GET') {
    let r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('weckcode').first();
    if (!r) {
      const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(24));
      const v = Array.from(b, (x) => a[x % a.length]).join('');
      await env.DB.prepare('INSERT INTO secrets (k,v) VALUES (?1,?2)').bind('weckcode', v).run();
      r = { v };
    }
    return json({ code: r.v });
  }

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

  // Morgen-Briefing als MP3 mit der Microsoft-Stimme (für den Kurzbefehl nach dem Wecker).
  if (p === '/api/briefing.mp3' && req.method === 'GET') {
    const doc = await briefing(env, { events: await todaysEvents(env) });
    try { return mp3(await speech(env, doc.text)); }
    catch (e) { return json({ error: String(e.message).startsWith('nokey') ? 'nokey' : 'tts_failed', message: String(e.message).slice(0, 200) }, 503); }
  }
  // Demo-Briefing für einen Montag mit Beispieldaten (wird nicht gespeichert).
  if (p === '/api/briefing/demo' && req.method === 'GET') {
    const doc = await briefing(env, { demo: true, fresh: true });
    if (url.searchParams.get('format') === 'mp3') {
      try { return mp3(await speakOnce(env, doc.text)); } catch (e) { return json({ error: 'tts_failed', message: String(e.message).slice(0, 200) }, 503); }
    }
    return new Response(doc.text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (p === '/api/stimme/probe' && req.method === 'GET') {
    try { return mp3(await probe(env, url.searchParams.get('v') || '')); }
    catch (e) { return json({ error: 'tts_failed', message: String(e.message).slice(0, 200) }, 503); }
  }
  if (p === '/api/stimme' && req.method === 'GET') {
    const on = !!(await gkey(env));
    return json({ aktiv: on, voice: on ? await voiceOf(env) : '', voices: on ? await voices(env) : [] });
  }
  if (p === '/api/stimme' && req.method === 'POST') {
    if (weck) return json({ error: 'unauthorized' }, 401);
    const b = await req.json();
    if (!b.key) { await env.DB.prepare('DELETE FROM secrets WHERE k=?1').bind('gtts').run(); await env.KV.delete('gvoices'); return json({ aktiv: false }); }
    const key = String(b.key).trim(), err = await checkKey(key);
    if (err) return json({ error: err.slice(0, 200) }, 400);
    await env.DB.prepare('INSERT OR REPLACE INTO secrets (k,v) VALUES (?1,?2)').bind('gtts', key).run();
    await env.KV.delete('gvoices');
    return json({ aktiv: true });
  }

  // Morgen-Briefing. format=text liefert reinen Text (für den Kurzbefehl zum Vorlesen).
  if (p === '/api/briefing' && req.method === 'GET') {
    const events = await todaysEvents(env);
    const doc = await briefing(env, { fresh: url.searchParams.get('fresh') === '1', events });
    if (url.searchParams.get('format') === 'text') return new Response(doc.text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    return json(doc);
  }

  if (p === '/api/geo/rev' && req.method === 'GET') {
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'invalid_argument' }, 400);
    return json({ place: await reverseGeocode(lat, lon).catch(() => null) });
  }

  if (p === '/api/geo' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return json({ results: [] });
    return json({ results: await geocode(q) });
  }

  return json({ error: 'not_found' }, 404);
}

async function todaysEvents(env) {
  try {
    const cfg = await getDoc(env, 'settings', 'kalender');
    const ics = (cfg && cfg.ics) || env.CAL_ICS;
    if (!ics) return null;
    const t = todayLocal();
    const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
    return await calendarEvents(ics, t, d.toISOString().slice(0, 10));
  } catch (e) { return null; }
}

export default {
  // Jeden Morgen um 5:15 Uhr (UTC) das Briefing vorbereiten, damit es beim Wecken sofort da ist.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(todaysEvents(env).then((events) => briefing(env, { fresh: true, events })).then((d) => speech(env, d.text)).catch(() => {}));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/mcp/')) {
      // Schreibt Claude den Tagesbericht, die Sprachdatei gleich vorbereiten – dann ist sie beim Wecken sofort da.
      if (req.method === 'POST') {
        const body = await req.clone().text().catch(() => '');
        if (/"reports"/.test(body) && /tag-\d{4}/.test(body)) ctx.waitUntil(new Promise((r) => setTimeout(r, 4000)).then(() => todaysEvents(env)).then((events) => briefing(env, { events })).then((d) => speech(env, d.text)).catch(() => {}));
      }
      try { return await mcp(req, env, url.pathname.slice(5).replace(/\/$/, '')); }
      catch (e) { return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Interner Fehler' } }, 500); }
    }
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
